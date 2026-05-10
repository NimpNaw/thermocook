# Packaging des Recettes — Guide

## Principe
Les recettes (~11 323 fichiers Markdown + images, ~795 Mo compressés) ne sont pas stockées dans git pour des raisons de performance et de taille. Elles sont distribuées sous forme d'archives `.tar.gz` ou `.zip`.

## Créer un package (Local)
Pour générer une archive versionnée sans l'uploader (utile pour le backup ou le transfert manuel) :
```bash
./create_package_receipes --version 1.0.0
```
L'archive sera nommée `recettes_v1.0.0.tar.gz`.

## Publier un package sur Gitea
Un script spécialisé permet de créer l'archive par source (Cookidoo ou Cookomix), de créer un Release sur Gitea et d'uploader l'asset :
```bash
# Pour Cookidoo
python scripts/package_by_source.py --version 1.0.0 --source ckdo_cookidoo

# Pour Cookomix
python scripts/package_by_source.py --version 1.0.0 --source cmix_cookomix
```
Cela créera les tags respectifs `cookidoo_v1.0.0` et `cookomix_v1.0.0` et les uploadera sur Gitea.

## Import en production

Le tableau de bord admin (`/admin`) permet d'importer ces archives pour peupler la base de données.

### Via URL distante
1. Aller dans Administration → Import/Export.
2. Coller l'URL de l'archive `.tar.gz` ou `.zip` (ex: lien direct Gitea, S3, ou tout serveur HTTP).
3. Cliquer **Installer**.

### Via chemin local (dans le conteneur)
1. Saisir le chemin du fichier accessible dans le conteneur (ex : `/app/data/recipes-backup.tar.gz`).
2. Cliquer **Installer**.

## Structure interne attendue
L'archive doit contenir une structure de dossiers où chaque dossier représente une recette :
```
recipes/
  <slug>_<id>/
    index.md
    images/
      principale.jpg
```
