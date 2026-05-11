# Procédure de release publique

> Ce document décrit la procédure de publication d'une nouvelle version de ThermoCook
> sur GitHub et GHCR. Il s'adresse au mainteneur principal du projet.

## Pré-requis (one-shot)

### 1. Créer le PAT GitHub

Créer un Personal Access Token (classic) avec les scopes :

- `repo` — lecture/écriture du repo
- `write:packages` — push des images sur ghcr.io
- `workflow` — **indispensable** pour pousser `.github/workflows/ci.yml` (sans ce
  scope, le premier push échoue avec `refusing to allow a Personal Access Token
  to create or update workflow ... without 'workflow' scope`)

Ajouter aussi, si tu prévois de pouvoir tout reset (suppression du repo +
packages pour repartir de zéro) :

- `delete_repo`
- `read:packages`
- `delete:packages`

### 2. Créer le fichier de config

```bash
mkdir -p ~/.config
cat > ~/.config/thermocook-publish.env <<EOF
GITHUB_USER=NimpNaw
GITHUB_TOKEN=<le-PAT>
GHCR_TOKEN=<le-PAT, ou un autre>
EOF
chmod 600 ~/.config/thermocook-publish.env
```

### 3. Vérifier l'environnement

```bash
which gh docker rsync
```

Le script ne dépend pas de `gh auth login` : il invoque `gh` avec le préfixe
`GH_TOKEN="$GITHUB_TOKEN"` à chaque appel.

## Publication d'une version

```bash
# Sur la branche main, working tree propre :
$EDITOR RELEASE_NOTES.md   # facultatif

./scripts/release-public.sh v1.0.0 --dry-run
# Vérifier la sortie. Si OK :

./scripts/release-public.sh v1.0.0 --notes RELEASE_NOTES.md
```

Le script orchestre : clone, scrub, validation, push GitHub, build et push des
images, création de la Release.

### Limite connue du `--dry-run`

Le `--dry-run` exécute le scrub et la validation regex, mais ne simule pas le
`git add -A` côté GitHub. Une règle `.gitignore` non-ancrée qui exclut un
fichier nécessaire à la CI publique ne sera pas détectée par le dry-run —
seulement au moment du push réel ou par échec de la CI. Si la première CI sur
le commit initial échoue, c'est une piste à vérifier en priorité.

### Visibilité des packages ghcr.io (post-release, manuel)

Les images poussées sur ghcr.io sont **privées par défaut**. L'API REST de
GitHub ne permet pas de les basculer en public — il faut passer par le web UI :

- https://github.com/users/NimpNaw/packages/container/thermocook-backend/settings → "Change package visibility" → Public
- https://github.com/users/NimpNaw/packages/container/thermocook-frontend/settings → idem

Une fois public, `docker pull ghcr.io/nimpnaw/thermocook-backend:vX.Y.Z`
fonctionne sans authentification.

## En cas d'échec partiel

Relancer avec `--force-tag` après avoir corrigé la cause :

```bash
./scripts/release-public.sh v1.0.0 --force-tag --notes RELEASE_NOTES.md
```

`--force-tag` supprime le tag local + remote avant de re-tager. Utile quand le
script a tagué localement mais a échoué avant le push, ou inversement.

### Reset complet (rare)

Si la première release est cassée et qu'il faut tout reprendre proprement
(repo + packages neufs), supprimer les ressources GitHub :

```bash
TOKEN="$(grep '^GITHUB_TOKEN=' ~/.config/thermocook-publish.env | cut -d= -f2-)"
GH_TOKEN="$TOKEN" gh repo delete NimpNaw/thermocook --yes
GH_TOKEN="$TOKEN" gh api -X DELETE /user/packages/container/thermocook-backend
GH_TOKEN="$TOKEN" gh api -X DELETE /user/packages/container/thermocook-frontend
```

Puis relancer `./scripts/release-public.sh vX.Y.Z` qui recréera tout à neuf.
Nécessite les scopes `delete_repo`, `delete:packages`, `read:packages` sur le
PAT (cf. pré-requis).

## Tester une nouvelle règle de scrub

```bash
bash scripts/lib/test-scrub.sh
bash scripts/lib/test-validate.sh
```
