document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        // Carica gli utenti dall'API SheetDB
        const response = await fetch('https://sheetdb.io/api/v1/kmkc001zw9m69');
        const users = await response.json();
        
        // Verifica se l'utente esiste e la password è corretta
        const user = users.find(u => u.email === email && u.password === password);
        
        if (user) {
            // Salva i dati dell'utente in localStorage
            localStorage.setItem('currentUser', JSON.stringify(user));
            window.location.href = '../../music_page/scopri.html';
        } else {
            alert('Credenziali non valide. Email o password errata.');
        }
    } catch (error) {
        console.error('Errore nel caricamento degli utenti:', error);
        alert('Errore durante l\'accesso. Prova di nuovo.');
    }
});

// Hamburger Menu
const hamburgerMenu = document.querySelector('.hamburger-menu');
const nav = document.querySelector('.nav');

hamburgerMenu.addEventListener('click', () => {
    nav.classList.toggle('nav--open');
    hamburgerMenu.classList.toggle('is-active');
    hamburgerMenu.setAttribute('aria-expanded', 
        hamburgerMenu.classList.contains('is-active')
    );
});

// Chiudi il menu quando si clicca su un link
document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', () => {
        nav.classList.remove('nav--open');
        hamburgerMenu.classList.remove('is-active');
        hamburgerMenu.setAttribute('aria-expanded', 'false');
    });
});