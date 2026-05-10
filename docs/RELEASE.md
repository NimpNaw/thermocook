# Procédure de release publique

> Ce document décrit la procédure de publication d'une nouvelle version de ThermoCook
> sur GitHub et GHCR. Il s'adresse au mainteneur principal du projet.

## Pré-requis (one-shot)

1. Créer un PAT GitHub (scopes : `repo`, `write:packages`).
2. Créer le fichier de config :

   ```bash
   install -d -m 700 ~/.config
   cat > ~/.config/thermocook-publish.env <<EOF
   GITHUB_USER=NimpNaw
   GITHUB_TOKEN=<le-PAT>
   GHCR_TOKEN=<le-PAT, ou un autre>
   EOF
   chmod 600 ~/.config/thermocook-publish.env
   ```

3. `gh auth login` avec le PAT.

## Publication d'une version

```bash
# Sur la branche main, working tree propre :
$EDITOR RELEASE_NOTES.md   # facultatif

./scripts/release-public.sh v1.0.0 --dry-run
# Vérifier la sortie. Si OK :

./scripts/release-public.sh v1.0.0 --notes RELEASE_NOTES.md
```

Le script orchestre : clone, scrub, validation, push GitHub, build et push des images, création de la Release.

## En cas d'échec partiel

Relancer avec `--force-tag` après avoir corrigé la cause :

```bash
./scripts/release-public.sh v1.0.0 --force-tag --notes RELEASE_NOTES.md
```

## Tester une nouvelle règle de scrub

```bash
bash scripts/lib/test-scrub.sh
bash scripts/lib/test-validate.sh
```
