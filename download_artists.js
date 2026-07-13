const fs = require('fs');
const https = require('https');
const path = require('path');

const artists = [
    "167 Gang", "Baby Gang", "Capo Plaza", "FSK SATELLITE",
    "Kid Yugi", "Morad", "Paky", "Sfera Ebbasta", "Shiva", "Travis Scott"
];

const destDir = "C:/Users/ict.pcto/Downloads/minerify/images/artists";

function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function fetchArtist(artist) {
    return new Promise((resolve, reject) => {
        const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    for (const artist of artists) {
        console.log(`Cerco ${artist}...`);
        try {
            const data = await fetchArtist(artist);
            if (data.data && data.data.length > 0 && data.data[0].picture_medium) {
                const picUrl = data.data[0].picture_medium;
                const safeName = artist.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const destPath = path.join(destDir, `${safeName}.jpg`);
                await downloadImage(picUrl, destPath);
                console.log(`[OK] Scaricata immagine per ${artist} (${safeName}.jpg)`);
            } else {
                console.log(`[!] Nessuna immagine per ${artist}`);
            }
        } catch (e) {
            console.error(`[ERR] Errore con ${artist}:`, e);
        }
        // sleep a bit to avoid rate limit
        await new Promise(r => setTimeout(r, 500));
    }
}

run();
