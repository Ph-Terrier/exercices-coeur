# Exercices d'entraînement · HE-Arc Santé

Site d'entraînement pour les étudiantes et étudiants de la HE-Arc Santé, à Neuchâtel,
dans deux formations : l'Année propédeutique santé (APS) et le Bachelor en soins
infirmiers. La page d'accueil présente un panneau par formation, avec ses cours.
Chaque formation a sa page, et chaque cours a une adresse permanente.

Année propédeutique santé (APS), page `#/aps` :

- Cœur et circulation (SPHANACR), `#/coeur` : le cœur, les vaisseaux et la pression artérielle ;
- Le système nerveux (SPHANASN), `#/neuro` : neurones et influx nerveux, système nerveux central.

Bachelor en soins infirmiers, page `#/bachelor` :

- 1re année : Physiologie appliquée, la cellule, métabolisme et nutrition (FO11PACE),
  `#/cellule` : la cellule, sa membrane et l'influx nerveux ; développement,
  vieillissement et mort cellulaire ; métabolisme et nutrition.

Adresse complète d'un cours : https://ph-terrier.github.io/exercices-coeur/#/cellule
(par exemple).

Onze formats : QCM, vrai ou faux, augmente ou diminue, calculs avec correction pas
à pas, calculs guidés par étapes, remise en ordre, associations, classements, textes
à trous, schémas à compléter, cartes mémoire. Feedback immédiat ; série recommandée (exercices manqués
et jamais faits en priorité, formats mélangés) ; séries par partie, par objectif ou
par format ; progression conservée sur l'appareil.

Ce dépôt ne contient que le site généré. Les exercices sont rédigés, audités
et relus dans le projet `quiz_generator` (format pivot YAML), puis exportés
ici par un script (`R/04_export_web.R`). Aucune donnée n'est collectée.

© HE-Arc Santé (Haute École Arc, Neuchâtel), 2026. Matériel d'enseignement ;
auteur responsable : Philippe Terrier. Exercices rédigés par des modèles Claude sous
la direction de l'auteur : Claude Fable 5.1 pour le cours cœur et circulation,
Claude Opus 5.5 pour le système nerveux, un sous-agent Claude Opus 5.5 pour FO11PACE.
La page « À propos » du site indique pour chaque cours si ses exercices sont validés
par l'auteur ou en cours de relecture. Logo HE-Arc Santé repris du modèle de
présentation de l'institution.

<!-- modified by a sub-agent (Claude Opus 5.5, site-shell implementer), 2026-09-24: two
     audiences (APS, Bachelor), courses listed by audience with their addresses, producers
     named per course (docs/site_design_2026-09-24.md, section 6.1). -->
