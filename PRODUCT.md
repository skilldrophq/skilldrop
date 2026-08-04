Sto costruendo Skilldrop, una CLI per condividere rapidamente agent skills locali
senza richiedere Git o un repository.

Posizionamento:
- Non è un marketplace o registry.
- Non deve sovrapporsi a skills.sh.
- skills.sh serve per discovery e installazione da repository.
- Skilldrop serve per trasferire skill che l’utente possiede già.
- È simile a transfer.sh / Gist per agent skills.

Brand:
- Prodotto: Skilldrop
- Dominio principale: skilldrop.dev
- Dominio installazione: getsk.dev
- Comando CLI: sk

UX principale:

    sk share <skill-name-or-path>
    # => https://skilldrop.dev/s/<id>

    sk install https://skilldrop.dev/s/<id>

Le skill possono provenire dalle directory globali di Claude, Codex e altri agent.
Il tool deve rilevare automaticamente i percorsi conosciuti.

Ogni condivisione crea uno snapshot immutabile, non una versione semantica.
Condividere nuovamente la stessa skill genera un nuovo link.

MVP:
- sk list
- sk share <name|path>
- sk inspect <url|id>
- sk install <url|id>
- sk remove <name>

Possibili opzioni:
- --agent claude|codex|all
- --expires 24h|7d
- --private
- --dry-run

Vincoli di prodotto:
- niente catalogo globale
- niente ricerca
- niente leaderboard
- niente stelle
- niente semver nell’MVP
- niente Git obbligatorio
- niente pagina “Explore”

La pagina web di uno snapshot mostra:
- nome
- data e scadenza
- preview di SKILL.md
- albero dei file
- checksum
- comando di installazione

Sicurezza:
- mostrare sempre i file prima dell’installazione
- rilevare symlink/path traversal
- checksum dell’archivio
- segnalare script eseguibili
- non eseguire automaticamente script contenuti nella skill

Obiettivo iniziale:
definire architettura, formato dello snapshot e implementare un primo MVP della CLI.