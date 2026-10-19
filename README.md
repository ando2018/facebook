# Blague du jour → Facebook

La tâche planifiée « Blague du jour » dépose chaque vidéo dans `a-publier/` :

```
a-publier/blague-du-jour-2026-10-20-matin.mp4
a-publier/blague-du-jour-2026-10-20-matin.json   { "titre": "...", "legende": "..." }
```

Le push déclenche l'Action `Publier sur Facebook`, qui publie la vidéo en Reel sur la Page
(API Reels de Meta, marquée « générée par IA »), puis retire le MP4 et range sa fiche dans `publies/`
avec l'ID du Reel. En cas d'échec, la vidéo reste dans `a-publier/` et repart au prochain push
(ou via « Run workflow » dans l'onglet Actions).

## Réglages GitHub (Settings → Secrets and variables → Actions)

| Type     | Nom              | Valeur                                                        |
|----------|------------------|---------------------------------------------------------------|
| Secret   | `FB_PAGE_ID`     | ID numérique de la Page                                       |
| Secret   | `FB_PAGE_TOKEN`  | Token de Page longue durée (voir ci-dessous)                  |
| Variable | `FB_VIDEO_STATE` | `PUBLISHED` (défaut) ou `DRAFT` pour valider chaque Reel avant |

## Obtenir le token de Page (une seule fois, ~10 min)

1. **Créer l'app** : developers.facebook.com → Mes apps → Créer une app. Choisis le cas d'usage
   de gestion d'une Page. Laisse-la en mode développement : comme tu es admin de la Page,
   aucune validation de Meta n'est nécessaire.
2. **Token utilisateur** : outils → Explorateur de l'API Graph. Sélectionne ton app, puis
   « Obtenir un token utilisateur » avec les permissions `pages_show_list`,
   `pages_read_engagement` et `pages_manage_posts`. Valide l'accès à ta Page.
3. **Le rendre longue durée** : outils → Débogueur de token d'accès. Colle le token,
   « Déboguer », puis « Étendre le token d'accès ». Copie le nouveau token.
4. **Token de Page** : dans l'Explorateur, colle ce token longue durée et lance
   `GET me/accounts`. Dans la réponse, ta Page a un `id` (→ `FB_PAGE_ID`) et un
   `access_token` (→ `FB_PAGE_TOKEN`). Ce token de Page n'expire pas tant que tu restes
   admin de la Page et ne changes pas ton mot de passe Facebook.

Ne partage jamais ce token ailleurs que dans les secrets GitHub.
