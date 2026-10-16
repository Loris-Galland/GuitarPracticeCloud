# M1 MIAGE 2026-2027 — Technos Web
## TP4 : Début du projet

---

## 1. Contexte et point de départ

À partir du TP4, vous démarrez votre **mini projet**. Vous disposez d'une plus grande liberté pour orienter votre réalisation.

### Acquis du prototype actuel
Votre projet s'appuie sur le prototype déjà mis en place, qui comprend :
- La **gestion des utilisateurs** (authentification / comptes).
- La **manipulation, l'upload et le download de fichiers**, ainsi que le traitement d'autres données via des formulaires.

---

## 2. Pistes et suggestions d'orientation

Réfléchissez à ce que vous souhaitez développer à partir du prototype existant. Plusieurs axes sont possibles :

1. **Mini réseau social de partage de fichiers multimédia** (partage, interactions, amis).
2. **Application « solo »** avec gestion fine des accès (fichiers publics vs privés), moteur de recherche interne, etc.
3. **Application orientée musique** (recommandée par l'enseignant).

---

## 3. Option : Amélioration du lecteur audio (*Improve Audio Player*)

Créer une interface soignée (UI) et exploiter la **WebAudio API** pour concevoir un lecteur audio avancé.

### Fonctionnalités suggérées :
- **Visualisations graphiques :**
  - Affichage de la forme d'onde (*waveform*).
  - Vu-mètres stéréo pour les volumes gauche / droite.
  - Animation temps réel du spectre de fréquences.
  - Animations fluides en arrière-plan (ex. shaders WebGL / WebGPU réagissant au son, comme dans le projet *butterchurn*).
- **Contrôles et ergonomie :**
  - Widgets personnalisés (*knobs* rotatifs, sliders, interrupteurs / switches).
  - Contrôle de la balance Gauche / Droite (Pan).
  - Égaliseur graphique multi-bandes pour ajuster le rendu sonore.
- **Effets audio paramétrables :**
  - Réverbération (*reverb*)
  - Distorsion
  - Délai (*delay*)
  - Filtres audio (fréquence de coupure / *cutoff*, résonance)
- **Ressources :**
  - Cours WebAudio (gratuit) : [W3C HTML5 Apps and Games sur edX](https://www.edx.org/learn/html5/the-world-wide-web-consortium-w3c-html5-apps-and-games), Chapitre 1.5.

---

## 4. Option : Gestion de fichiers publics / privés & Réseau social

Concevoir une plateforme de partage collaboratif entre utilisateurs.

### Fonctionnalités clés :
- **Fichiers publics :**
  - Consultables et recherchables par l'ensemble des utilisateurs.
  - Section dédiée aux fichiers récemment ajoutés.
  - Moteur de recherche de fichiers (*Search files*).
- **Fichiers privés et partage :**
  - Fichiers réservés à leur propriétaire par défaut.
  - Partage sélectif avec des « amis ».
  - Gestion des partages (possibilité de révoquer/stopper un partage à tout moment).
- **Fonctionnalités sociales :**
  - Système d'amis (inviter, ajouter, supprimer).
  - Flux d'activité des amis.

---

## 5. Méthodologie et consignes de travail (avec l'assistant IA)

Avant de vous lancer dans le code, discutez et validez les points suivants avec votre assistant IA :

1. **Fonctionnalités souhaitées :** Définissez clairement le périmètre de ce que vous voulez réaliser.
2. **Interfaces utilisateur (UI) :** Examinez les différentes maquettes et propositions d'interface.
3. **Implémentation technique :** Discutez des choix technologiques, de l'architecture logicielle et de la démarche à suivre.
4. **Découpage du travail :** Divisez le projet en étapes, missions ou tâches progressives, puis débutez par la première.

### Exigences qualité et livrables :
- **Tests unitaires :** Demandez à votre assistant IA d'écrire des tests unitaires pour chaque nouvelle fonctionnalité afin de valider leur bon fonctionnement.
- **Rapport de projet (`REPORT.md`) :** Rédigez un compte-rendu documentant :
  - Le travail effectué.
  - Les choix techniques et d'architecture.
  - La liste des fonctionnalités implémentées.
  - Les résultats et la couverture des tests.