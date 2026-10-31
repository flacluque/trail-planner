# Ravitime

Planificateur de course trail : à partir du roadbook (et/ou de la trace GPX) et de tes courses
de référence, il calcule les **heures de passage à chaque ravito**, les **marges sur les barrières
horaires** et le **temps total**, selon trois scénarios (optimiste / réaliste / prudent). Son champ pour montre
Garmin s'appelle **Prochain Ravito** (voir [connectiq/](connectiq/README.md)).

> Anciennement « Trail Planner » (nom déjà pris). Les identifiants internes gardent l'ancien nom : paquet Java
> `fr.trailplanner`, artefact Maven, service Render, clés du stockage du navigateur (`trail-planner:…`, pour ne pas
> perdre les courses déjà saisies) et préfixe `TP1` du code du plan (les codes déjà collés sur les montres restent bons).

> v0.1 : moteur de calcul + API REST + front React (carte, profil altimétrique, tableau imprimable, hors ligne).

## Lancer le projet

Prérequis : Java 21, Maven 3.9+.

```bash
mvn test                 # tests unitaires (parser GPX, analyse, modèle, planificateur)
mvn spring-boot:run      # API sur http://localhost:8080
```

### Le front (React)

Prérequis : Node.js 20+. Dans un second terminal, l'API tournant à côté :

```bash
cd frontend
npm install              # la première fois
npm run dev              # http://localhost:5173 (les appels /api sont relayés vers le port 8080)
```

- **Six onglets** pour ne pas se perdre :
  - **Accueil** : à quoi sert Ravitime et comment s'en servir, avec un aperçu du plan. Affiché à la
    première visite, puis on arrive sur « Mon plan » (le logo ramène à l'accueil) ;
  - **Mon plan** : l'arrivée prévue et sa fourchette, la barrière la plus serrée, la carte, le profil et
    les heures de passage (le tableau détaillé est dans « Analyse ») ;
  - **Ravitos** : quoi emporter au départ, puis quoi faire à chaque ravito, à l'heure prévue ;
  - **Sac** : la checklist du matériel ;
  - **Analyse** : scénarios, poids des références, préparation, tableau détaillé, comparaison ;
  - **Comment ça marche** : le calcul expliqué, avec ses sources.

  Chaque onglet a son adresse (`#ravitos`, `#sac`…). Tes références se replient en un résumé une fois
  le plan calculé ; les réglages fins sont dans « Options avancées ».
- **Carte et profil synchronisés** : survole l'un ou l'autre pour voir l'altitude, le D+ cumulé et
  l'heure de passage estimée (interpolée entre deux ravitos).
- **Trois scénarios** : clique sur une carte pour afficher son tableau détaillé ; le tableau de
  comparaison les met côte à côte.
- **Ma course** : saisis le roadbook de ta course (un point par ravito : km, D+ cumulé, type de
  ravito, barrières « 14h30 » dont le jour est déduit tout seul), ou importe-le en JSON (même format
  que `src/main/resources/samples/bogomiles/roadbook.json`). La trace GPX est **facultative** : sans
  elle, pas de carte ni de profil, et le calcul se fait sur le D+ du roadbook. Ta course et ta trace
  restent dans ton navigateur ; « Exporter » télécharge le roadbook pour le garder.
- **Lire un roadbook (image / PDF)** : une IA lit le roadbook de l'organisation et remplit le
  tableau de « Ma course » ; tu vérifies ligne par ligne, le roadbook d'origine affiché au-dessus.
  Voir « Lecture automatique des roadbooks » plus bas.
- **Importer depuis Strava** : dans « Tes références », choisis tes courses et sorties de course à
  pied ou de trail ; distance, D+, date et temps de déplacement (pauses exclues, le temps écoulé à
  défaut) sont repris tels quels. Les sorties les plus proches de ta course sont signalées. Voir « Import des activités Strava » plus bas.
- **Ta préparation** : avec Strava connecté, le calcul tient compte de ton entraînement. La carte
  montre ton volume semaine par semaine, ta plus longue sortie et ta régularité, et de combien le
  temps de chaque référence est corrigé selon l'écart avec ta préparation actuelle.
- **Ravitos (nutrition et hydratation)** : ton profil en quelques clics (glucides par heure, flasques et
  combien de boisson énergétique, tes propres produits : gels, solides, boissons, et si tu manges aux
  ravitos), puis la course tronçon par tronçon : une consigne de rythme (« 1 gel toutes les 40 min »,
  l'ordre de prise), quoi boire, et à chaque point quoi remplir, manger ou récupérer. Choisis où
  t'attend ton assistance : tu ne portes que jusque-là, et une fiche lui dit quoi préparer. Moins de
  glucides la première heure et la nuit ; alerte si les flasques ne suffisent pas.
- **Matériel** : checklist par course, à cocher en faisant le sac. Elle se remplit en lisant le règlement
  (image ou PDF, y compris un tableau commun à plusieurs courses), à partir d'une liste type, ou à la
  main. Elle propose des suggestions selon le plan (frontale si tu passes la nuit dehors) et compare
  l'eau obligatoire à tes flasques.
- **Comment ça marche** : un onglet explique le calcul pas à pas (kilomètre-effort, loi de Riegel,
  pondération des références, forme d'entraînement, simulation, nutrition), avec les chiffres de ton
  plan et les sources des études utilisées. Lien direct : `#algorithme`.
- **Télécharger le PDF** : en **résumé** (une page à garder sur soi : passages, barrières et ce qu'il
  faut faire à chaque ravito) ou **complet**. Le complet : le plan en A4, prêt à garder sur le téléphone ou à imprimer. Il contient
  les trois scénarios, le profil avec les ravitos, tes références, les heures de passage du scénario
  sélectionné (services de chaque ravito, marges en couleur), la nutrition et l'hydratation par
  tronçon, la comparaison des scénarios et la checklist du matériel à cocher. Il est généré dans le
  navigateur, donc ça marche aussi hors ligne.
- **Hors ligne** : le dernier plan calculé est gardé dans le navigateur, et l'appli est une PWA
  (installable sur le téléphone, fonctionne sans réseau une fois chargée — build de production :
  `npm run build && npm run preview`).

```bash
npm test                 # tests unitaires (formatage, barrières, interpolation, profil)
npm run build            # vérification TypeScript + build de production dans frontend/dist
```

### Essayer l'API tout de suite (Raid des Bogomiles embarqué)

```bash
# Tableau texte des 3 scénarios avec ta référence 60 km / 3 200 m D+ en 8h48
curl "http://localhost:8080/api/demo/bogomiles/report?refKm=60&refGain=3200&refTime=PT8H48M"

# Même chose en JSON
curl "http://localhost:8080/api/demo/bogomiles"

# Comparaison roadbook 2026 vs trace GPX, point par point
curl "http://localhost:8080/api/demo/bogomiles/check"

# Ce que le front dessine : roadbook, trace rééchantillonnée et position des ravitos sur la trace
curl "http://localhost:8080/api/demo/bogomiles/course?stepKm=0.1"
```

### Avec tes propres fichiers

```bash
# Analyse d'une trace : distance, D+/D-, profil rééchantillonné tous les 100 m
curl -F "gpx=@ma-trace.gpx" http://localhost:8080/api/tracks/analyze

# Course à dessiner (carte, profil, ravitos) à partir de ton roadbook et de ta trace
curl -F "race=@mon-roadbook.json;type=application/json" -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/courses

# Plans + course à dessiner en une requête (ce qu'utilise le front pour « Ma course »)
curl -F "request=@requests/plan-bogomiles.json;type=application/json" -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/plans/full

# Plan de course : roadbook + références en JSON, trace GPX optionnelle
curl -F "request=@requests/plan-bogomiles.json;type=application/json" \
     -F "gpx=@ma-trace.gpx" \
     http://localhost:8080/api/plans
```

`requests/plan-bogomiles.json` est un exemple complet de requête. Les durées sont au format
ISO-8601 (`PT8H48M` = 8 h 48) et les dates en heure locale (`2026-10-23T14:30:00`).

## Lecture automatique des roadbooks

L'IA qui lit les roadbooks se choisit dans `src/main/resources/application.properties`
(`trailplanner.extraction.*`). Par défaut : **Ollama**, une IA locale et gratuite, rien ne sort de ta machine.

```bash
# 1. Installer Ollama : https://ollama.com (appli macOS), puis la lancer
# 2. Télécharger le modèle de vision (~6 Go, une seule fois)
ollama pull qwen2.5vl:7b
# 3. Relancer l'API : le bouton « Lire un roadbook » de l'éditeur est prêt
```

- Images (PNG, JPEG, photo de téléphone) et PDF. Dans un livret de plus de 4 pages (accès, navettes,
  règlement...), seules les 4 pages qui décrivent le parcours sont lues, repérées grâce à leur texte
  (heures, km, mots-clés). Quand le PDF contient du texte, il est envoyé au modèle avec les images :
  les nombres y sont exacts. Compter 30 s à 2 min par roadbook.
- Beaucoup de roadbooks ne donnent le dénivelé qu'en dessin (profil) : l'IA laisse alors le D+ vide
  plutôt que de l'inventer, et il faut ajouter la trace GPX de la course.
- L'IA ne fait que **pré-remplir** l'éditeur : rien n'est calculé sans ta relecture.
- Changer de modèle : `trailplanner.extraction.ollama.model=...` (après `ollama pull ...`).
- **Gemini** (l'IA de Google, utilisée pour le site en ligne) : `trailplanner.extraction.provider=gemini`
  et une clé gratuite (https://aistudio.google.com/apikey) dans `TRAILPLANNER_EXTRACTION_GEMINI_API_KEY`.
  Plus rapide (quelques secondes), mais les documents sont envoyés à Google. Modèle :
  `trailplanner.extraction.gemini.model` (par défaut `gemini-flash-latest`). Gemini gratuit est souvent
  surchargé : l'appli retente, puis essaie les modèles de `trailplanner.extraction.gemini.fallback-models`
  (par défaut `gemini-2.5-flash,gemini-flash-lite-latest`, chacun avec son propre quota).
- Désactiver : `trailplanner.extraction.provider=none`.
- Ajouter une autre IA : une implémentation de `DocumentReader` et une ligne dans
  `ExtractionConfig`. Ni le front ni le reste du backend ne changent : la même IA lit les roadbooks
  et les règlements.

**Mesurer la qualité d'un modèle** sur de vrais roadbooks et règlements (comparés à une saisie à la main) :

```bash
mvn test -Dtest=RoadbookExtractionEvalTest -Dollama=true -Dollama.model=qwen2.5vl:7b
mvn test -Dtest=GearExtractionEvalTest -Dollama=true -Dollama.model=qwen2.5vl:7b
```

Le test affiche, point par point, les champs mal lus et un score global. Pour ajouter un roadbook de
test : l'image dans `src/test/resources/roadbooks/`, la saisie de référence dans
`src/main/resources/samples/<course>/roadbook.json`, et une ligne dans `RoadbookExtractionEvalTest`.

## Import des activités Strava

Strava demande une **application API**, gratuite, à créer une fois avec ton compte :

1. Sur https://www.strava.com/settings/api, crée une application :
   - nom : `Ravitime` (au choix), catégorie : `Training` ;
   - site web : `http://localhost` ;
   - **domaine de rappel (Authorization Callback Domain) : `localhost`**.
2. Note l'**identifiant client** (Client ID) et le **secret client** (Client Secret).
3. À la racine du projet, crée le fichier `config/application.properties` (le dossier `config/` est
   ignoré par git, le secret ne part donc pas sur GitHub) :
   ```properties
   trailplanner.strava.client-id=12345
   trailplanner.strava.client-secret=le-secret-client
   ```
   Ou, au choix, les variables d'environnement `TRAILPLANNER_STRAVA_CLIENT_ID` et
   `TRAILPLANNER_STRAVA_CLIENT_SECRET`.
4. Redémarre l'API, puis dans l'appli : « Importer depuis Strava » → « Se connecter avec Strava ».
   Strava demande ton accord ; laisse cochée la lecture des activités (y compris privées).

- Les jetons de connexion sont gardés dans un **cookie chiffré du navigateur** (illisible sans la clé du
  serveur) : chacun ne voit que ses activités, le serveur ne garde aucun compte. L'API les renouvelle
  toute seule. « Se déconnecter » révoque l'accès chez Strava et efface le cookie.
- L'import suit ta préparation : les 10 à 16 semaines (le même réglage que la prise en compte de la forme)
  qui précèdent la semaine de ta course. La date de la course est reprise du plan et se change dans
  l'import (calendrier où le bloc est surligné) ; pour une course à venir, seules les semaines déjà
  faites comptent. L'appli résume le bloc (sorties, km, D+, km/semaine) et coche d'office ses
  **courses** et les **3 sorties qui ressemblent le plus à ta course**. Les footings restent hors des
  références (ils fausseraient l'allure) mais comptent dans la mesure de la forme, activée à l'import.
  Les **anciennes courses** (avant le bloc, jusqu'à 5 ans) sont proposées à part, les plus proches de ta
  course d'abord.
- Seules les sorties **Course à pied** et **Trail** sont proposées. Celles dont le type de sortie est
  « Course » dans Strava sont pré-réglées en course, les autres en entraînement (modifiable).
- Une nouvelle application Strava ne connecte que le compte de son créateur. Pour des testeurs, passe sa
  capacité à 10 sportifs dans les réglages de l'application (sans validation de Strava).
- Strava affiche `"field":"client_id","code":"invalid"` : l'identifiant ne correspond à aucune
  application. `client-id` doit être le **Client ID**, un nombre (pas le secret ni un jeton d'accès),
  recopié depuis https://www.strava.com/settings/api ; redémarre l'API après chaque modification.

## Le modèle de calcul

1. **Kilomètre-effort** (convention ITRA) : `E = distance (km) + D+ (m) / 100`.
2. **Loi de fatigue de Riegel** appliquée à l'effort : le temps pour atteindre l'effort cumulé `E`
   vaut `T(E) = a × E^b`. Avec `b > 1`, l'allure se dégrade au fil de la course.
3. **Calibration** : `a` est déduit de tes performances de référence (`a = T_ref / E_ref^b`).
   Le temps de référence inclut les arrêts. Avec plusieurs références, on fait une moyenne pondérée
   pour tenir compte de ta progression depuis ta course de référence :
   - **récence** : le poids est divisé par deux tous les 6 mois écoulés avant la course ;
   - **distance** : poids `1 / (1 + |ln(effort course / effort référence)|)`, soit ×0,6 pour un
     effort deux fois plus court ;
   - **entraînement** : une sortie chronométrée compte comme une course 10 % plus rapide, avec un
     poids ×0,6 (la conversion reste approximative).

   Le plan indique aussi l'arrivée prédite par chaque référence seule, et son poids.
4. **Forme d'entraînement** (avec Strava, option « Tenir compte de mon entraînement Strava ») : on
   compare le **bloc de préparation** de chaque référence à celui de ta course, soit les semaines
   avant la semaine de course (jusqu'à aujourd'hui pour une course à venir), en km-effort par semaine,
   randonnées comprises si tu le choisis. La durée du bloc se règle de 10 à 16 semaines (12 par
   défaut, « Ma préparation dure ») ; la même durée sert pour la course et les références. Le temps de la référence est multiplié par
   `(volume référence / volume course)^0,10`, dans la limite de ±8 % (Tanda 2011 : +10 % de volume
   ≈ −1 % de temps au niveau amateur). À partir de 3 courses dont on connaît la préparation, cet
   exposant est ajusté sur tes propres résultats. La demi-vie de la récence passe alors à 1 an, et :
   - si ta plus longue sortie fait moins de 40 % de l'effort de la course, le scénario prudent
     compte 2 % de plus ;
   - si ton volume des 4 dernières semaines (hors affûtage) s'effondre, l'appli te prévient.

   Le détail, avec les études sur lesquelles il s'appuie : [docs/v0.3-forme.md](docs/v0.3-forme.md).
5. **Simulation pas à pas** (tous les 0,05 km-effort) : on applique la forme du jour, le facteur
   de nuit si l'horloge est dans la plage frontale, puis les arrêts aux ravitos.
6. **Barrières horaires** : entrée et/ou sortie de ravito. Statut `OK` (> 1 h de marge), `TIGHT`
   (< 1 h), `MISSED` (dépassée).

| Scénario  | Forme du jour | Exposant fatigue | Facteur nuit | Arrêt ravito | Arrêt base de vie |
|-----------|--------------:|-----------------:|-------------:|-------------:|------------------:|
| Optimiste | 0,96          | 1,06             | +5 %         | 2 min        | 8 min             |
| Réaliste  | 1,00          | 1,07             | +10 %        | 4 min        | 15 min            |
| Prudent   | 1,05          | 1,08             | +15 %        | 6 min        | 25 min            |

Tous ces paramètres sont surchargeables dans la requête (`scenarios`).

### Roadbook ou trace GPX ?

`elevationSource` = `AUTO` (défaut), `ROADBOOK` ou `TRACK`. En `AUTO`, on prend le D+ officiel du
roadbook s'il est complet : c'est le parcours de l'année, alors qu'une trace GPX trouvée en ligne
date souvent d'une édition précédente. La trace sert alors au profil et au contrôle de cohérence.

Pour le dénivelé mesuré sur la trace, on filtre le bruit altimétrique (hystérésis de 3 m) : sans
ce filtre, la trace des Bogomiles donne ~4 500 m D+ au lieu de ~3 770 m.

## Mode assistance

Pour l'équipe qui suit le coureur : dans **Ravitos › Réglages › Mon assistance**, choisis les points où
elle t'attend, puis **Envoyer le lien à mon assistance** (WhatsApp, mail…). Un seul lien pour toute
l'équipe, sans compte ni code d'invitation : le plan (les trois scénarios, les points, ce qu'il faut
préparer) est compressé dans le lien lui-même (`/#assistance=…`), rien n'est stocké sur le serveur.

Sur son téléphone, l'assistance voit :

- le **prochain rendez-vous** : « sois là avant 17h20 » (heure au plus tôt moins une marge qu'elle règle),
  le créneau d'arrivée (optimiste → prudent), la barrière et la marge, ce qu'il faut préparer (à cocher),
  le rappel frontale si la suite passe de nuit ;
- **tous les rendez-vous**, et le **temps de route entre deux points** au choix, calculé par OSRM
  (itinéraires OpenStreetMap, sans le trafic ; estimation à vol d'oiseau sans réseau), avec l'heure de
  départ conseillée et un lien vers Maps (il faut la trace GPX pour connaître la position des points) ;
- **Saisir un passage** : l'heure vue sur le suivi en direct de l'organisation recale les rendez-vous.

Le jour J, après un « Je suis à … » dans « En course », **Prévenir mon assistance** renvoie un lien à
jour avec ton avance ou ton retard. Envoie le lien par mail ou WhatsApp : un SMS peut le couper.

## Mettre le site en ligne (Render)

Pour faire tester l'appli à des amis : un seul serveur (l'API sert aussi le front), décrit par le
`Dockerfile` et `render.yaml`. L'offre gratuite de Render suffit : le site s'endort après 15 min sans
visite et met environ une minute à se réveiller.

1. **Clé Gemini** (lecture des roadbooks en ligne, gratuite) : https://aistudio.google.com/apikey →
   « Create API key ». Les documents lus sont alors envoyés à Google.
2. **Render** : crée un compte sur https://render.com avec GitHub, puis **New + → Blueprint** et choisis
   ce dépôt (branche à déployer). Render lit `render.yaml` et demande les valeurs secrètes :
   - `TRAILPLANNER_EXTRACTION_GEMINI_API_KEY` : la clé Gemini ;
   - `TRAILPLANNER_STRAVA_CLIENT_ID` et `TRAILPLANNER_STRAVA_CLIENT_SECRET` : ceux de l'application Strava ;
   - `TRAILPLANNER_ACCESS_CODE` : le code d'invitation à donner aux amis (vide : site ouvert à tous) ;
   - `TRAILPLANNER_FEEDBACK_URL` : le lien du bouton « Donner mon avis » (formulaire Google Forms,
     Tally…, ou `mailto:toi@exemple.fr`) ; vide : pas de bouton.

   `TRAILPLANNER_SECRET` (clé des cookies) est tiré au hasard par Render. Le premier déploiement
   prend quelques minutes ; l'adresse du site est du type `https://trail-planner-xxxx.onrender.com`. Le site public est
   branché sur `https://ravitime.fr` (Render › Settings › Custom Domains ; DNS chez one.com).
3. **Strava**, sur https://www.strava.com/settings/api :
   - **domaine de rappel** : le domaine du site, sans `https://` (`ravitime.fr`).
     Strava n'en accepte qu'un : pour revenir au local, remets `localhost` ;
   - **capacité** : 10 sportifs, pour que tes amis puissent connecter leur compte.
4. Envoie l'adresse et le code d'invitation. Chaque visiteur saisit le code une fois (retenu un an) ;
   changer `TRAILPLANNER_ACCESS_CODE` le redemande à tout le monde.

Ce qui est gardé où : références, courses et réglages restent dans le navigateur de chacun ; la
connexion Strava est un cookie chiffré ; le serveur ne garde rien (il peut redémarrer sans perte).

Pour essayer l'image en local : `docker build -t trail-planner . && docker run -p 8080:8080 trail-planner`.

## Appli iPhone (Capacitor)

Le même site, emballé par [Capacitor](https://capacitorjs.com) dans `frontend/ios/`. L'appli appelle le serveur en
ligne (`frontend/.env.app`), garde la connexion Strava et le code d'accès dans ses en-têtes (pas de cookies), ouvre
Strava dans le navigateur intégré et revient par le lien `ravitime://strava?…`, et partage les fichiers (.fit,
.gpx, PDF) par la feuille de partage d'iOS.

Sur un Mac avec Xcode :

```bash
cd frontend
npm ci
npm run ios          # construit la version appli, la copie dans ios/ et ouvre Xcode
```

Dans Xcode : cible **App** → **Signing & Capabilities** → choisir son équipe (un identifiant Apple suffit pour
essayer sur son iPhone), brancher l'iPhone, puis ▶︎. Après une modification du site : `npm run build:app && npx cap
sync ios`, puis ▶︎ à nouveau.

## Appli Android (Capacitor)

Le même projet, dans `frontend/android/` (identifiant `fr.ravitime.app`). L'appli s'affiche bord à bord : les marges de
la barre d'état et de la barre de navigation viennent de `env(safe-area-inset-*)`, comme sur l'iPhone. Le bouton retour
referme d'abord la fenêtre ouverte, puis revient à la page d'avant, et quitte l'appli depuis la première.

Avec [Android Studio](https://developer.android.com/studio) (il installe le SDK Android et Java) :

```bash
cd frontend
npm ci
npm run android      # construit la version appli, la copie dans android/ et ouvre Android Studio
```

Dans Android Studio : attendre la fin de « Gradle sync », brancher le téléphone (options pour les développeurs et
débogage USB activés) ou lancer un émulateur, puis ▶︎ Run. Après une modification du site : `npm run build:app && npx cap
sync android`, puis ▶︎ à nouveau.

## Architecture

```
fr.trailplanner
├── gpx       Lecture GPX en streaming (StAX), sans dépendance
├── track     Distance (haversine), D+/D- filtré, profil cumulé interpolable
├── model     Course, ravitos, références, scénarios, plage de nuit (records)
├── engine    Modèle d'effort, découpage en tronçons, planificateur
├── report    Rendu texte imprimable
├── api       Spring Boot : contrôleur REST, service, DTO
├── extract   Lecture de documents par une IA (roadbook, matériel) : interface + Ollama / Gemini, images / PDF
├── strava    Connexion OAuth à Strava, jetons en cookie chiffré, import des sorties comme références
└── web       Site en ligne : chiffrement des cookies, code d'invitation, lien d'avis

frontend/src
├── api         Types (miroir des records Java), client, copie hors ligne du dernier plan
├── lib         Formatage (durées ISO, heures), barrières, interpolation, géométrie du profil, PDF
└── components  Formulaire, scénarios, carte Leaflet, profil SVG, tableaux
```

Le cœur (`gpx`, `track`, `model`, `engine`, `report`) est en Java pur : il ne dépend pas de Spring
et pourra être réutilisé tel quel (CLI, appli mobile via une API, batch de calibration...).

## Feuille de route

- [x] **v0.1** : GPX, roadbook, heures de passage, barrières, 3 scénarios, nuit
- [x] **v0.1-front** : React + TypeScript, carte Leaflet, profil altimétrique, tableau imprimable, PWA hors ligne
- [x] **v0.1-import** : saisir / importer son roadbook, trace GPX facultative
- [x] **v0.1-lecture** : lecture du roadbook (image / PDF) par une IA configurable, Ollama par défaut
- [x] **v0.1-références** : plusieurs références datées (courses, entraînements), pondérées
- [x] **v0.2** : services des ravitos, nutrition / hydratation par tronçon, checklist du matériel
  obligatoire (lue dans le règlement), le tout dans le PDF (voir [docs/v0.2-conception.md](docs/v0.2-conception.md))
- [ ] **v0.2-météo** (option) : prévision Open-Meteo pour ajuster l'hydratation et le matériel
- [x] **v0.3** : import des activités Strava comme références (voir [docs/v0.3-conception.md](docs/v0.3-conception.md)),
  forme d'entraînement (volume des 10 à 16 semaines de préparation) dans la prédiction
  ([docs/v0.3-forme.md](docs/v0.3-forme.md)), onglet « Comment ça marche » avec les sources
- [x] **v0.4** : appli allégée : cinq onglets par thème (Mon plan, Ravitos, Sac, Analyse, Comment ça marche),
  références repliées, PDF résumé d'une page
- [x] **v0.4.x** : lisibilité « roadbook terrain », vue « En course », onglets en bas sur téléphone
- [x] **v0.5** : mode assistance : lien de suivi pour l'équipe, rendez-vous recalés, temps de route (OSRM)
- [x] **v0.6** : pente et descente dans le modèle : chaque tronçon découpé selon la pente de la trace (D+ et D-
  comptés séparément, descente technique) ; **profil de coureur** : coût par tranche de pente mesuré sur tes sorties
  Strava, fatigue mesurée sur tes courses (**retour de course** : la course réelle comparée au plan, ravito par ravito)
- [x] **v0.7** : la montre : parcours Garmin (.fit : trace, ravitos, partenaire virtuel au rythme du plan), champ
  Connect IQ « Prochain Ravito » (prochain ravito, heure estimée, écart au plan, vibration à 300 m), et parcours .gpx
  pour les autres marques (COROS, Suunto, Polar…), ravitos nommés avec leur heure prévue
- [x] **v0.7c** : ravitos placés sur la trace : un ravito se fait glisser sur la carte jusqu'à sa vraie place (roadbook
  faux), les waypoints du GPX au nom des ravitos sont repris, et le site signale un ravito dont le D+ ou le waypoint ne
  colle pas avec le km du roadbook. Le plan, le parcours Garmin et le code du champ suivent la position sur la trace

## Comptes (Supabase)

Facultatifs : ils sauvegardent « Mes courses » et les réglages pour les retrouver sur tous les appareils. L'appli parle
directement à Supabase avec la clé publique du projet ; chaque coureur n'accède qu'à ses lignes (Row Level Security).
Rien de ce qui vient de Strava n'y est envoyé.

1. Projet Supabase (région Europe), connexion par e-mail avec code (`{{ .Token }}` dans les modèles Magic Link et
   Confirm signup), envoi par Resend depuis `@ravitime.fr` (SMTP).
2. Une fois : exécuter `supabase/schema.sql` dans Supabase › SQL Editor (tables `races` et `settings`, stockage
   `traces`, suppression du compte).
3. Sur Render : `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`, que le serveur transmet à l'appli (`/api/app`). Sans
   elles, l'appli marche sans comptes.
