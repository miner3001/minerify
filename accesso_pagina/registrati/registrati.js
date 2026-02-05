document.getElementById('registerForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const dataNascita = document.getElementById('dataNascita').value;

    try {
        // Carica gli utenti dall'API SheetDB
        const response = await fetch('https://sheetdb.io/api/v1/kmkc001zw9m69');
        const users = await response.json();
        
        // Verifica se l'email esiste già
        const userExists = users.some(u => u.email === email);
        
        if (userExists) {
            alert('Questa email è già registrata. Usa un\'email diversa.');
            return;
        }
        
        // Crea un nuovo utente
        const newUser = {
            nome: nome,
            email: email,
            password: password,
            dataNascita: dataNascita
        };
        
        // Invia il nuovo utente al server tramite POST su SheetDB
        const createResponse = await fetch('https://sheetdb.io/api/v1/kmkc001zw9m69', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({data: newUser})
        });
        
        if (createResponse.ok) {
            const result = await createResponse.json();
            
            // Salva i dati dell'utente in localStorage
            localStorage.setItem('currentUser', JSON.stringify(newUser));
            
            alert('Registrazione completata con successo! Accedi con le tue credenziali.');
            
            // Reindirizza alla pagina di accesso
            setTimeout(() => {
                window.location.href = '../accedi/accedi.html';
            }, 1500);
        } else {
            alert('Errore durante la registrazione. Prova di nuovo.');
        }
        
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        alert('Errore durante la registrazione. Prova di nuovo.');
    }
});

