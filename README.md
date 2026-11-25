# ESIR HL7 Front-End

[![CI](https://github.com/cdelanchy/esir-hl7-front-end/actions/workflows/ci.yml/badge.svg)](https://github.com/cdelanchy/esir-hl7-front-end/actions/workflows/ci.yml)
[![Licence CC BY-NC-SA 4.0](https://img.shields.io/badge/licence-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr)

Front-end du TP HL7 de l'ESIR : **suivi des patients dans le SIH**.

L'application convertit des messages **HL7 v2 ADT** (A01 admission, A02 mutation, A03 sortie) en ressources **FHIR R4**, les envoie à un serveur FHIR, et affiche l'état des patients tel qu'il est enregistré sur ce serveur.

Les consignes du TP sont dans le dépôt [esir-hl7-tp](https://github.com/cdelanchy/esir-hl7-tp).

## Fonctionnalités

- **Upload d'un message HL7** (`.hl7` / `.txt`) : vérification de l'état du patient sur le serveur FHIR, conversion, puis envoi sous forme de Bundle FHIR `transaction`.
- **Tableau des patients** synchronisé avec le serveur FHIR : chargé à l'ouverture de la page puis rafraîchi périodiquement (15 s par défaut), il affiche aussi les patients envoyés par d'autres clients.
- **Dernière venue de chaque patient** : dates d'admission et de sortie, service, chambre, lit et statut, avec un code couleur :
  - vert : admission ;
  - orange : mutation ;
  - gris : sortie.
- **Historique des mouvements** de chaque patient (bouton « Historique ») : toutes ses venues, chacune avec ses mouvements datés et leur localisation.
- **Affichage du Bundle FHIR** généré pour le dernier message (bouton à bascule).

## Prérequis

- [Node.js](https://nodejs.org/) 26 ou plus récent, avec npm.
- Un **serveur FHIR R4** accessible depuis le navigateur, avec un client autorisé en authentification *Basic*.
- Pour l'image Docker : [Docker](https://www.docker.com/).

## Démarrage rapide

```bash
npm install
# Renseigner l'URL et le client du serveur FHIR dans .env (voir « Configuration »)
npm run dev
```

L'application est servie sur <http://localhost:8005>.

Des messages d'exemple sont disponibles dans [`fixtures/`](fixtures/) : `A01.hl7`, `A02.hl7` et `A03.hl7` décrivent l'admission, la mutation puis la sortie d'un même patient.

## Configuration

La configuration est lue par Vite dans les fichiers d'environnement, puis centralisée dans [`src/config.js`](src/config.js) :

- `.env` est utilisé par `npm run dev` et `npm run build` ;
- `.env.prod` est utilisé pour l'image Docker, construite en mode Vite `prod`.

> [!IMPORTANT]
> Les variables sont intégrées au JavaScript **au moment du build** : redémarrez `npm run dev` ou reconstruisez l'image après une modification.

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| `VITE_FHIR_SERVER_URL` | URL du serveur FHIR | `http://localhost:8080` |
| `VITE_FHIR_SERVER_CLIENT_ID` | Identifiant du client du serveur FHIR (auth *Basic*) | `client_id` |
| `VITE_FHIR_SERVER_CLIENT_CREDENTIAL` | Secret du client du serveur FHIR | `client_secret` |
| `VITE_PATIENTS_REFRESH_INTERVAL_SECONDS` | Intervalle de rafraîchissement du tableau, en secondes | `15` |
| `VITE_PARENT_REPOSITORY_URL` | Lien « Instructions du TP » du pied de page (masqué si vide) | *(vide)* |

> [!WARNING]
> Le navigateur appelle le serveur FHIR directement : l'identifiant et le secret du client sont donc **lisibles dans le JavaScript servi**. Ce fonctionnement convient à un TP, pas à un serveur exposé en production.

## Scripts npm

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement Vite sur le port 8005 |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Sert le build de `dist/` sur le port 4173 |
| `npm test` | Tests unitaires (Vitest) |
| `npm run clean` | Supprime les fichiers ignorés par git (`dist/`, `node_modules/`…) |
| `npm run docker:dev` | Image Docker de dev, voir [Docker](#docker) |
| `npm run docker:release [-- <version>]` | Image Docker de release, voir [Docker](#docker) |

## Conversion HL7 v2 → FHIR

La conversion est faite par [`src/services/hl7Transformer.js`](src/services/hl7Transformer.js).

### Champs HL7 utilisés

| Champ HL7 | Ressource / élément FHIR |
| --- | --- |
| `MSH-9` | Type de message (`ADT^A01`, `ADT^A02`, `ADT^A03`) |
| `EVN-6`, à défaut `EVN-2` | **Seule date utilisée** : date du mouvement, date d'admission (A01) et date de sortie (A03) |
| `PID-3` (répétition de type `PI`) | `Patient.identifier` (IPP) ; l'OID de l'autorité d'affectation donne le `system` (`urn:oid:…`) |
| `PID-5` (type `L` / `D`) | `Patient.name` : nom de naissance (`official`) / nom d'usage (`usual`) |
| `PID-7`, `PID-8` | `Patient.birthDate`, `Patient.gender` |
| `PV1-2` | `Encounter.class` (`IMP`, `AMB`, `EMER`) |
| `PV1-3` | Hiérarchie de `Location` : service → chambre → lit |
| `PV1-19` | Identifiant de l'Encounter **séjour** (numéro de venue) |
| `ZBE-1` | Identifiant de l'Encounter **mouvement** |

Un message sans `EVN-6` ni `EVN-2` est refusé.

### Ressources produites

Chaque message produit un Bundle `transaction` contenant :

- le **Patient**, créé ou mis à jour par *conditional update* sur son identifiant ;
- l'**Encounter séjour**, créé ou mis à jour par *conditional update* sur `PV1-19`. Il est `in-progress`, puis `finished` après un A03 ;
- l'**Encounter mouvement**, identifié par `ZBE-1` et rattaché au séjour par `partOf`, qui porte les localisations ;
- les **Location** service, chambre et lit, reliées entre elles par `partOf`.

### Règles de gestion

| Message | Refusé si… |
| --- | --- |
| A01 | le patient existe déjà sur le serveur |
| A02 / A03 | le patient n'existe pas, est déjà sorti, ou la date de l'évènement est antérieure à son dernier mouvement |

Le séjour étant remplacé à chaque message, A02 et A03 reprennent la date d'admission déjà enregistrée sur le serveur.

### Lecture depuis le serveur

[`src/services/patientRows.js`](src/services/patientRows.js) reconstruit le tableau à partir des Patients et Encounters du serveur. Le type de chaque mouvement est déduit :

- le premier mouvement d'un séjour est une **admission** ;
- un mouvement terminé est une **sortie** ;
- les autres mouvements sont des **mutations**.

## Structure du projet

```text
├── fixtures/                 Messages HL7 d'exemple (utilisés aussi par les tests)
├── scripts/docker-image.sh   Construction des images Docker (dev / release)
├── src/
│   ├── assets/               Logo de la licence
│   ├── components/
│   │   ├── Patients.vue      Page principale : upload, tableau, historique, bundle
│   │   └── AppFooter.vue     Pied de page : liens GitHub et licence
│   ├── services/
│   │   ├── hl7Transformer.js Conversion HL7 v2 → Bundle FHIR
│   │   ├── patientRows.js    Ressources FHIR du serveur → lignes du tableau
│   │   └── FhirServerApi.js  Client HTTP du serveur FHIR (recherche, pagination, transaction)
│   ├── config.js             Configuration issue des variables d'environnement
│   ├── router/               Routeur Vue
│   ├── App.vue
│   └── main.js
├── tests/                    Tests unitaires Vitest
├── Caddyfile                 Configuration du serveur Caddy de l'image Docker
└── Dockerfile
```

## Tests

```bash
npm test
```

Les tests unitaires ([`tests/`](tests/)) couvrent la conversion HL7 → FHIR et la construction du tableau à partir des ressources du serveur. Ils s'appuient sur les messages de [`fixtures/`](fixtures/).

La CI GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute les tests et le build à chaque push et pull request.

## Docker

L'image est construite en deux étapes : un build Node (`vite build --mode prod`, donc avec `.env.prod`), puis une image [Caddy](https://caddyserver.com/) qui ne contient que l'application compilée.

```bash
# Image de dev, taguée avec le hash du dernier commit :
# esir-hl7-front-end:dev-<hash>, suffixé -dirty s'il reste des modifications non commitées
npm run docker:dev

# Image de release, taguée <version> et latest. La version vaut, dans l'ordre :
# l'argument, sinon le tag git posé sur HEAD, sinon le hash du commit.
npm run docker:release -- 1.2.3
npm run docker:release

# Lancement
docker run --rm -p 8080:80 esir-hl7-front-end:latest
```

Une release est refusée s'il reste des modifications non commitées. Les variables `IMAGE_NAME` (nom de l'image) et `BUILD_MODE` (mode Vite, `prod` par défaut) permettent d'ajuster la construction. Aucune image n'est poussée vers un registre.

> [!NOTE]
> L'URL du serveur FHIR est appelée **par le navigateur** : `localhost` y désigne le poste de l'utilisateur, pas le conteneur.

## Contribuer

Les contributions sont les bienvenues : voir le [guide de contribution](CONTRIBUTING.md).

## Licence

Ce projet est distribué sous licence [Creative Commons Attribution - Pas d'Utilisation Commerciale - Partage dans les Mêmes Conditions 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr). Voir [LICENSE](LICENSE).
