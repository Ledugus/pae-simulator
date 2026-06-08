# PAElla - Composeur de PAE

Outil de composition et simulation de PAE (Programme Annuel Etudiant) orienté pour les étudiants en Master à l'EPL, UCLouvain.


## Description

Choississez un programme de Master parmi ceux proposés dans l'onglets "Programmes". Composez ensuite votre PAE en ajoutant les cours qui vous plaisent jusqu'à atteindre le nombre de crédits suffisants. Le composeur vous donnera alors l'intitulé du diplôme ainsi que l'orientation générale du programme constitué.

## TODO:
Scraping : 
- Scrape prérequis
- Scrape API de l'horaire

Logique de validation : 
- règle de prérequis

UI : 
- Panels ajustables
- Arrangement des cours choisis selon le quadri, drag & drop des cours dans le slot voulu
- Ajouter un widget de prévisualisation de l'horaire

Collab : 
- Faire la repo github
- Envoyer un message sur le discord d'update
- README propre

## Setup
Pour lancer l'app en local : 
```bash
git clone "https://github.com/Ledugus/pae-simulator.git" pae-simulator
cd pae-simulator
python3 -m venv .venv
pip install -r requirements.txt
python3 src/seed.py # Setup the database
fastapi dev
```


## Contribuer
Le projet est tout nouveau, n'hésitez pas à proposer des améliorations ou du feedback via une *issue* ou à contribuer à une fonctionnalité avec une *pull-request*.
