document.addEventListener('DOMContentLoaded', () => {
    // 1. Estrai il piano dall'URL
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan') || 'individual';
    
    const summaryName = document.getElementById('summary-plan-name');
    const summaryPrice = document.getElementById('summary-plan-price');

    if (plan === 'family') {
        summaryName.textContent = 'Minerify Premium Family';
        summaryPrice.textContent = '€14.99';
    } else if (plan === 'student') {
        summaryName.textContent = 'Minerify Premium Student';
        summaryPrice.textContent = '€4.99';
    } else {
        summaryName.textContent = 'Minerify Premium Individual';
        summaryPrice.textContent = '€9.99';
    }

    // 2. Elementi della Form e Visual Card
    const nameInput = document.getElementById('full-name');
    const numberInput = document.getElementById('card-number');
    const expiryInput = document.getElementById('expiry-date');
    const cvvInput = document.getElementById('cvv');

    const displayName = document.getElementById('card-display-name');
    const displayNumber = document.getElementById('card-display-number');
    const displayExpiry = document.getElementById('card-display-expiry');

    // Sincronizza il nome
    nameInput.addEventListener('input', (e) => {
        displayName.textContent = e.target.value.trim() ? e.target.value : 'NOME TITOLARE';
    });

    // Formatta e Sincronizza il numero carta
    numberInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, ''); // Solo numeri
        let formattedVal = val.match(/.{1,4}/g)?.join(' ') || '';
        e.target.value = formattedVal;
        
        displayNumber.textContent = formattedVal ? formattedVal.padEnd(19, '•') : '•••• •••• •••• ••••';
    });

    // Formatta e Sincronizza scadenza (MM/AA)
    expiryInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 2) {
            val = val.substring(0, 2) + '/' + val.substring(2, 4);
        }
        e.target.value = val;
        displayExpiry.textContent = val ? val : 'MM/AA';
    });

    // Solo numeri per CVV
    cvvInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // 3. Gestione Submit Animata
    const form = document.getElementById('payment-form');
    const overlay = document.getElementById('payment-overlay');
    const overlayMessage = document.getElementById('overlay-message');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Controlli base
        if (numberInput.value.length < 19 || expiryInput.value.length < 5 || cvvInput.value.length < 3) {
            alert("Per favore inserisci dati di carta validi per la simulazione.");
            return;
        }

        // Mostra overlay di caricamento
        overlay.classList.add('active');
        overlay.classList.remove('success');
        overlayMessage.textContent = 'Elaborazione pagamento...';

        // Simula ritardo server (2 secondi)
        setTimeout(() => {
            overlay.classList.add('success');
            overlayMessage.textContent = 'Pagamento confermato!';

            // Dopo altri 2 secondi, reindirizza alla libreria
            setTimeout(() => {
                window.location.href = '../music_page/playlist.html';
            }, 2500);

        }, 2000);
    });

    // Hamburger Menu (Standard Minerify behaviour)
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const nav = document.querySelector('.nav');

    if (hamburgerMenu && nav) {
        hamburgerMenu.addEventListener('click', () => {
            nav.classList.toggle('nav--open');
            hamburgerMenu.classList.toggle('is-active');
            hamburgerMenu.setAttribute('aria-expanded', 
                hamburgerMenu.classList.contains('is-active')
            );
        });

        document.querySelectorAll('.nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('nav--open');
                hamburgerMenu.classList.remove('is-active');
                hamburgerMenu.setAttribute('aria-expanded', 'false');
            });
        });
    }
});