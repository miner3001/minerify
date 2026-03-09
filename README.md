# Minerify

Una moderna piattaforma musicale web costruita con tecnologie frontend pure. Scopri, ascolta e organizza la tua musica preferita in un'interfaccia elegante e intuitiva.

---

## Descrizione del Progetto

Minerify è un progetto amatoriale iniziato a novembre 2024 come evoluzione dell'esercitazione "Spotify dei poveri". L'applicazione offre un'esperienza di streaming musicale completa, con album, playlist personali e sistemi di abbonamento premium. Il design moderno e la riproduzione continua rendono l'esperienza utente fluida e coinvolgente.

---

## Caratteristiche Principali

### Pagina Home
Punto di accesso principale dell'applicazione, che introduce l'utente all'ecosistema di Minerify. Funge da hub centrale per navigare verso le diverse sezioni della piattaforma.

### Pagina Scopri
Il cuore dell'esperienza musicale con le seguenti funzionalità:

- **Visualizzazione Album:** Layout accattivante con copertine, titoli e pulsanti di riproduzione
- **Ricerca:** Barra di ricerca avanzata per trovare rapidamente album e canzoni
- **Controlli di Riproduzione:** Completa barra di controllo con play/pausa, navigazione tra brani, shuffle, loop e controllo volume
- **Riproduzione Continua:** La musica continua a suonare durante la navigazione tra i menu
- **Transizione Album Automatica:** Passa al successivo album al termine della riproduzione
- **Sistema Mi Piace:** Aggiungi brani ai tuoi preferiti con un clic
- **Effetti Visivi:** Card eleganti con animazioni hover e effetti di profondità

### Pagina La Tua Libreria
Sezione dedicata alla gestione della libreria musicale personale dell'utente. Una base per future funzionalità di playlist personalizzate e sincronizzazione.

### Pagina Premium
Presenta i vantaggi dell'abbonamento premium e i diversi piani disponibili:

- Premium (accesso illimitato)
- Premium Family (per nuclei familiari)
- Premium Student (tariffe agevolate per studenti)

Include un design moderno con tema blu neon e una presentazione accattivante dei vantaggi.

### Pagina di Accesso
Sistema di autenticazione completo con:

- Accesso con username/password
- Registrazione di nuovi utenti
- Recupero password

---

## Struttura del Progetto

```
minerify/
├── index.html                      # Homepage principale
├── index.css                       # Stili globali
├── accesso_pagina/                 # Sistema di autenticazione
│   ├── accedi/                     # Pagina di accesso
│   ├── registrati/                 # Pagina di registrazione
│   └── passwordimenticata/         # Recupero password
├── music_page/                     # Sezione musica
│   ├── scopri.html / scopri.css    # Pagina scopri
│   ├── playlist.html / playlist.css# Pagina libreria
│   ├── durations.json              # Dati durate canzoni
│   └── music/                      # Cartella file audio
├── pagamento/                      # Sezione premium
│   ├── premium.html / premium.css  # Pagina abbonamenti
│   └── pagamento.html / pagamento.css # Checkout
├── other/                          # Pagine aggiuntive
│   ├── privacy.html                # Informativa privacy
│   └── terms.html                  # Termini di servizio
├── img/                            # Risorse grafiche
├── Informazioni/                   # Documentazione interna
└── README.md                       # Questo file
```

---

## Tecnologie Utilizzate

- **HTML5** - Markup semantico e struttura della pagina
- **CSS3** - Styling responsivo e animazioni
- **JavaScript (Vanilla)** - Logica client-side e interattività

---

## Come Iniziare

1. Clona o scarica il repository
2. Apri il file `index.html` in un browser web moderno
3. Esplora l'applicazione e naviga attraverso le diverse sezioni

---

## Note di Sviluppo

- Database e backend non sono ancora implementati (versione frontend)
- La persistenza dei dati utilizza localStorage per la sessione
- Le canzoni e gli album sono gestiti attraverso file JSON statici

---

## Sviluppo Futuro

- Integrazione backend per persistenza dati
- API per sincronizzazione con servizi musicali esterni
- Sistema di raccomandazioni personalizzato
- Miglioramenti alla qualità audio
- Applicazione mobile nativa

