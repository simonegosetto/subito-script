const TelegramBot = require('node-telegram-bot-api');
// const tesseract = require('tesseract.js');
// const tesseractWorker = tesseract.createWorker();
const axios = require('axios');
const puppeteer = require('puppeteer');

// replace the value below with the Telegram token you receive from @BotFather
// const token = '7708166046:AAFLalzK6BXgAtrUazLl-gQhpCgdMSOEIPs';

// Create a bot that uses 'polling' to fetch new updates
// const bot = new TelegramBot(token, {polling: true});

// Configurazione base
const BASE_URL = 'https://hades.subito.it/v1/search/items';
const QUERY = 'gtx 1070'; // Stringa di ricerca
const CATEGORY = '10'; // Informatica
const LIMIT = 100; // Annunci per pagina

// Parole chiave per filtrare annunci
const POSITIVE_KEYWORDS = ['funzionante', 'perfettamente', 'testata', 'ottimo', 'garanzia'];
const NEGATIVE_KEYWORDS = ['rotto', 'rotta', 'non funzionante', 'guasto', 'difettoso'];


// Funzione per chiamare l'API
async function fetchAds(start = 0) {
    const url = `${BASE_URL}?q=${encodeURIComponent(QUERY)}&c=${CATEGORY}&t=s&shp=true&urg=false&sort=relevance&lim=${LIMIT}&start=${start}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Errore durante la chiamata API: ${error.message}`);
        return null;
    }
}

// Funzione per filtrare annunci
function filterAds(ads, priceThreshold = 0.7, maxPrice = 800, maxDaysOld = 300) {
    const lowerQuery = QUERY.toLowerCase();
    const now = new Date();

    // Estrarre i prezzi validi e i dati di data
    const validAds = ads
        .map(ad => {
            const price = parseFloat(ad.features.find(f => f.uri === '/price')?.values[0]?.key || 0);
            const date = new Date(ad.dates.display_iso8601); // Data di pubblicazione
            return { ...ad, price, date };
        })
        .filter(ad => ad.price > 0); // Ignora annunci senza prezzo valido

    // Filtrare annunci recenti
    const recentAds = validAds.filter(ad => {
        const daysOld = (now - ad.date) / (1000 * 60 * 60 * 24);
        return daysOld <= maxDaysOld;
    });

    if (recentAds.length === 0) {
        console.log('Nessun annuncio recente trovato.');
        return [];
    }

    // Calcolo del prezzo mediano
    const sortedPrices = recentAds.map(ad => ad.price).sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

    console.log(`Prezzo mediano calcolato: €${medianPrice.toFixed(2)}`);

    // Filtrare annunci rilevanti
    return recentAds.filter(ad => {
        const title = ad.subject.toLowerCase();
        const body = ad.body.toLowerCase();

        // Controllo presenza della stringa di ricerca
        const matchesQuery = title.includes(lowerQuery) || body.includes(lowerQuery);

        // Controllo parole chiave positive e negative
        // const hasPositive = POSITIVE_KEYWORDS.some(keyword => title.includes(keyword) || body.includes(keyword));
        const hasNegative = NEGATIVE_KEYWORDS.some(keyword => title.includes(keyword) || body.includes(keyword));

        // Verifica soglie di prezzo
        const isBelowMaxPrice = ad.price <= maxPrice;
        const isBelowMedianThreshold = ad.price <= medianPrice * priceThreshold;

        return (
            matchesQuery && // Deve contenere la stringa di ricerca
            // hasPositive &&
            !hasNegative &&
            isBelowMaxPrice &&
            isBelowMedianThreshold
        );
    });
}


// Funzione per controllare se un prodotto è venduto
async function isAdSold(url) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Modifica questo selettore in base all'elemento che indica che il prodotto è venduto
        const soldSelector = '.item-sold-badge'; // Esempio: classe che appare se venduto
        const isSold = await page.$(soldSelector);

        await browser.close();
        return !!isSold; // true se l'elemento esiste, false altrimenti
    } catch (error) {
        console.error(`Errore durante il controllo dell'annuncio: ${error.message}`);
        await browser.close();
        return false; // Considera disponibile in caso di errore
    }
}

// Funzione per filtrare annunci venduti
async function filterSoldAds(ads) {
    const availableAds = [];

    for (const ad of ads) {
        console.log(`Controllo disponibilità per: ${ad.subject}`);
        const sold = await isAdSold(ad.urls.default);
        if (!sold) {
            availableAds.push(ad);
        } else {
            console.log(`Annuncio venduto: ${ad.subject}`);
        }
    }

    return availableAds;
}

// Funzione principale
async function _main() {
    let start = 0;
    let allAds = [];
    let totalAds = 0;

    console.log('Inizio ricerca annunci...');

    while (true) {
        const data = await fetchAds(start);
        if (!data || !data.ads || data.ads.length === 0) break;

        // Aggiungi gli annunci alla lista totale
        allAds = allAds.concat(data.ads);

        // Se è la prima chiamata, memorizza il numero totale di annunci
        if (start === 0) totalAds = data.count_all;

        // Incrementa lo start per passare alla pagina successiva
        start += LIMIT;

        // Interrompi se abbiamo caricato tutti gli annunci
        if (start >= totalAds) break;
    }

    console.log(`Trovati ${allAds.length} annunci totali.`);

    allAds = allAds.filter(ad => ad.subject.toLowerCase().includes(QUERY.toLowerCase()))
    // Filtra gli annunci
    const filteredAds = filterAds(allAds);
    console.log(`Annunci rilevanti (${filteredAds.length}):`);

    const availableAds = await filterSoldAds(filteredAds);
    console.log(`Annunci disponibili (${availableAds.length}):`);

    availableAds.forEach(ad => {
        // console.log(ad)
        console.log(`- ${ad.subject} (€${ad.features.find(f => f.uri === '/price')?.values[0]?.key || 'N/D'})`);
        console.log(`  Link: ${ad.urls.default}`);
    });
}

// Esegui lo script
_main();


/*const _init = async () => {
    await tesseractWorker.load();
    await tesseractWorker.loadLanguage('ita');
    await tesseractWorker.initialize('ita');
}*/

// Matches "/echo [whatever]"
/*
bot.onText(/\/echo (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const resp = match[1]; // the captured "whatever"
    // send back the matched "whatever" to the chat
    bot.sendMessage(chatId, resp);
});
*/

// Listen for any kind of message. There are different kinds of
// messages.
/*bot.on('message', (msg) => {
    console.log(msg);
    const chatId = msg.chat.id;
    if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1];
        bot.getFileLink(photo.file_id).then((link) => {
            console.log(link);
            // bot.sendMessage(chatId, link);
            tesseractWorker.recognize(link).then(({ data: { text } }) => {
                console.log(text);
            })
        });
    }
});*/


// _init();
