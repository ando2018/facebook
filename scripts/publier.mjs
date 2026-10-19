// Publie sur la Page Facebook chaque fichier en attente dans a-publier/ :
// une vidéo .mp4 en Reel, une image .png/.jpg en photo.
// Chaque vidéo arrive avec un fichier .json du même nom : { "titre": "...", "legende": "..." }
// Après publication, la vidéo est retirée et sa fiche rangée dans publies/ avec l'ID du Reel.
//
// Variables (secrets / variables GitHub) :
//   FB_PAGE_ID     ID numérique de la Page
//   FB_PAGE_TOKEN  token de Page longue durée (pages_manage_posts, pages_read_engagement, pages_show_list)
//   FB_VIDEO_STATE PUBLISHED (défaut) ou DRAFT pour valider à la main dans Meta Business Suite
//   FB_API_VERSION v26.0 par défaut

import { readdir, readFile, stat, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const STATE = (process.env.FB_VIDEO_STATE || "PUBLISHED").toUpperCase();
const V = process.env.FB_API_VERSION || "v26.0";
const ATTENTE = "a-publier";
const FAITS = "publies";

if (!PAGE_ID || !TOKEN) {
  console.error("FB_PAGE_ID et FB_PAGE_TOKEN doivent être définis dans les secrets du dépôt.");
  process.exit(1);
}

const graph = `https://graph.facebook.com/${V}`;

async function appel(url, options = {}) {
  const r = await fetch(url, options);
  const texte = await r.text();
  let corps;
  try { corps = JSON.parse(texte); } catch { corps = { brut: texte }; }
  if (!r.ok || corps.error) {
    throw new Error(`${r.status} ${url.split("?")[0]} → ${JSON.stringify(corps.error || corps)}`);
  }
  return corps;
}

async function publierReel(fichierVideo, { titre, legende }) {
  // 1. Ouvrir une session d'envoi
  const debut = await appel(`${graph}/${PAGE_ID}/video_reels`, {
    method: "POST",
    body: new URLSearchParams({ upload_phase: "start", access_token: TOKEN }),
  });
  const videoId = debut.video_id;

  // 2. Envoyer le fichier
  const donnees = await readFile(fichierVideo);
  await appel(`https://rupload.facebook.com/video-upload/${V}/${videoId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      offset: "0",
      file_size: String(donnees.length),
      "Content-Type": "application/octet-stream",
    },
    body: donnees,
  });

  // 3. Publier avec la légende
  const params = {
    upload_phase: "finish",
    video_id: videoId,
    video_state: STATE,
    description: legende || "",
    is_ai_generated: "true",
    access_token: TOKEN,
  };
  if (titre) params.title = titre;
  await appel(`${graph}/${PAGE_ID}/video_reels`, { method: "POST", body: new URLSearchParams(params) });

  // 4. Attendre la fin du traitement côté Facebook (max ~5 min).
  // La publication est déjà demandée : une lecture du statut qui échoue (vidéo pas
  // encore visible) ne doit pas faire repartir la vidéo, sinon elle sera publiée deux fois.
  let illisible = 0;
  for (let i = 0; i < 30; i++) {
    let s;
    try {
      s = await appel(`${graph}/${videoId}?fields=status&access_token=${encodeURIComponent(TOKEN)}`);
    } catch (e) {
      console.warn(`  … statut illisible pour l'instant (${e.message.slice(0, 120)})`);
      if (++illisible >= 3) break; // déjà publiée : on la range quand même
      await new Promise((ok) => setTimeout(ok, 10_000));
      continue;
    }
    const v = s.status?.video_status;
    if (v === "ready" || v === "published") break;
    if (v === "error") throw new Error(`Traitement refusé par Facebook : ${JSON.stringify(s.status)}`);
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
  return videoId;
}

// Image (.png/.jpg) : publiée en photo sur la Page, avec la légende.
async function publierPhoto(fichierImage, { legende }) {
  const donnees = await readFile(fichierImage);
  const type = /\.png$/i.test(fichierImage) ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("source", new Blob([donnees], { type }), path.basename(fichierImage));
  form.append("caption", legende || "");
  form.append("published", STATE === "DRAFT" ? "false" : "true");
  form.append("access_token", TOKEN);
  const r = await appel(`${graph}/${PAGE_ID}/photos`, { method: "POST", body: form });
  return r.post_id || r.id;
}

const MEDIAS = /\.(mp4|png|jpe?g)$/i;
const fichiers = (await readdir(ATTENTE).catch(() => [])).filter((f) => MEDIAS.test(f)).sort();
if (!fichiers.length) {
  console.log("Rien à publier.");
  process.exit(0);
}

await mkdir(FAITS, { recursive: true });
let echecs = 0;

for (const f of fichiers) {
  const video = path.join(ATTENTE, f);
  const fiche = video.replace(MEDIAS, ".json");
  const estVideo = /\.mp4$/i.test(f);
  try {
    const meta = JSON.parse(await readFile(fiche, "utf8").catch(() => "{}"));
    const taille = (await stat(video)).size;
    console.log(`→ ${f} (${(taille / 1e6).toFixed(1)} Mo) en ${STATE}…`);
    const id = estVideo ? await publierReel(video, meta) : await publierPhoto(video, meta);
    console.log(`  ✓ ${estVideo ? "Reel" : "Photo"} ${id}`);
    await writeFile(
      path.join(FAITS, path.basename(fiche)),
      JSON.stringify({ ...meta, video: f, [estVideo ? "reel_id" : "post_id"]: id, etat: STATE, le: new Date().toISOString() }, null, 2) + "\n",
    );
    await rm(fiche, { force: true });
    await rm(video);
  } catch (e) {
    echecs++;
    console.error(`  ✗ ${f} : ${e.message}`);
  }
}

process.exit(echecs ? 1 : 0);
