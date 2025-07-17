const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3');
const notifier = require('node-notifier');
const { exec } = require('child_process');

const parariusBaseUrl = "https://www.pararius.com"

const dbPath = `${process.env.HOME}/rents.db`

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database:', err.message);
    } 
});

async function getParariusRents(city) {

    console.log(`Fetching rents from ${city}.`);
    const parariusUrl = `https://www.pararius.com/apartments/${city}/0-2000/upholstered`;
    const response = await axios.get(parariusUrl);
    const $ = cheerio.load(response.data);

    const rents = [];

    $('.search-list__item--listing').each((i, row) => {

        const pictureUrl = ""

        let url = ""
        let title = ""
        let address = ""
        let price = ""
        let roomInfo = ""
        let surfaceArea = ""

        $(row).find('.listing-search-item__link--depiction').each((i, href) => {
            const relativeUrl = href.attributes.find(attr => attr.name == "href").value
            url = `${parariusBaseUrl}${relativeUrl}`
        });

        $(row).find('.listing-search-item__link--title').each((i, href) => title = $(href).text().trim());
        $(row).find('.listing-search-item__sub-title').each((i, div) => address = cleanString($(div).text()));
        $(row).find('.listing-search-item__price').each((i, div) => price = cleanString(div.firstChild.data));
        $(row).find('.illustrated-features__item--number-of-rooms').each((i, div) => roomInfo = cleanString(div.firstChild.data));
        $(row).find('.illustrated-features__item--surface-area').each((i, div) => surfaceArea = cleanString(div.firstChild.data));

        const rent = {
            url,
            pictureUrl ,
            title,
            address,
            price,
            roomInfo,
            surfaceArea,
            city
        };

        rents.push(rent);
    });


    return rents;
}


function cleanString(str) {
    let cleanHtml = str.replace(/<[^>]*>/g, '');

    return cleanHtml.replace(/[\r\n]+/g, ' ').trim();
}

function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function fetchRents() {
    const rotterdamRents = await getParariusRents('rotterdam');
    const denHaagRents = await getParariusRents('den-haag');
    const amsterdamRents = await getParariusRents('amsterdam');
    const haarlemRents = await getParariusRents('haarlem');
    const leidenRents = await getParariusRents('leiden');

    const rents = rotterdamRents.concat(denHaagRents).concat(leidenRents).concat(amsterdamRents).concat(haarlemRents)

    const query = "INSERT INTO rents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    db.all("SELECT * FROM rents", [], (err, rows) =>{
        const notAddedRents = rents.filter(rent => rows.find(row => row.url == rent.url) == undefined).reverse()
        const len = notAddedRents.length;

        if (len > 0) {
            console.log(`${len} new rents found.`);
            const statement = db.prepare(query);
            let i = 0;
            notAddedRents.forEach(rent => {
                const date = new Date();
                const unixTimestamp = Math.floor(date.getTime() / 1000) + i;

                statement.run([rent.url, rent.pictureUrl, rent.title, rent.address, rent.city, rent.price, rent.roomInfo, rent.surfaceArea, randomString(10), unixTimestamp]);
                i++;
            });

            statement.finalize(err => {
                if (err) {
                    console.error('Error finalizing statement:', err.message);
                } else {
                    console.log('New rents added to the DB.');
                }
            });

            notifier.notify({
                title: "New Rent Posts available",
                message: `${len} new rent posts available! Please have a look asap!`,
                wait: true
            });
            exec('paplay /usr/share/sounds/Yaru/stereo/message.oga');
        } else {
            console.log('No new rents found.');
        }
    });
}

(async () => {
    while (true) {
        console.log(`Checking Rents at ${new Date()}`);
        await fetchRents();
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
})();

