
## Mode de développement rapide

Privilégier les itérations courtes et les modifications ciblées.

Pour chaque demande :
- Implémenter uniquement la fonctionnalité demandée.
- Ne pas refactoriser les modules sans nécessité.
- Exécuter le typecheck et les tests directement
  concernés par les modifications.
- Ne pas lancer toute la suite Playwright par défaut.
- Ne pas générer de captures responsive sauf demande.
- Ne pas répéter les tests E2E trois fois sauf en
  présence d'une instabilité identifiée.
- Ne pas modifier le moteur pour résoudre un simple
  problème d'interface.

Avant chaque déploiement ou modification majeure :
- Exécuter les tests unitaires et d'intégration.
- Exécuter les parcours E2E essentiels.
- Vérifier le build de production.

En fin de tâche :
- Résumer les fichiers modifiés.
- Indiquer les tests réellement exécutés.
- Signaler les risques et les tests reportés.
- Éviter les rapports longs lorsque tout fonctionne.

Priorité : obtenir rapidement une version jouable
et recueillir des retours réels.