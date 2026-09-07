/*
 * Script Name: Mass Snipe
 * Version: v1.1.5
 * Last Updated: 2025-08-15
 * Author: RedAlert
 * Author URL: https://twscripts.dev/
 * Author Contact: redalert_tw (Discord)
 * Approved: N/A
 * Approved Date: 2023-01-20
 * Mod: JawJaw
 */

/* Copyright (c) RedAlert
By uploading a user-generated mod (script) for use with Tribal Wars, you grant InnoGames a perpetual, irrevocable, worldwide, royalty-free, non-exclusive license to use, reproduce, distribute, publicly display, modify, and create derivative works of the mod. This license permits InnoGames to incorporate the mod into any aspect of the game and its related services, including promotional and commercial endeavors, without any requirement for compensation or attribution to you. InnoGames is entitled but not obligated to name you when exercising its rights. You represent and warrant that you have the legal right to grant this license and that the mod does not infringe upon any third-party rights. You are - with the exception of claims of infringement by third parties – not liable for any usage of the mod by InnoGames. German law applies.
*/

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;

// Script Config
var scriptConfig = {
    scriptData: {
        prefix: 'massSnipe',
        name: 'Mass Snipe',
        version: 'v1.1.4',
        author: 'RedAlert',
        authorUrl: 'https://twscripts.dev/',
        helpLink:
            'https://forum.tribalwars.net/index.php?threads/mass-snipe.290217/',
    },
    translations: {
        en_DK: {
            'Mass Snipe': 'Mass Snipe',
            Help: 'Help',
            'There was an error!': 'There was an error!',
            'There was an error while fetching the data!':
                'There was an error while fetching the data!',
            'Redirecting...': 'Redirecting...',
            'There was an error fetching villages by group!':
                'There was an error fetching villages by group!',
            'An error occured while fetching troop counts!':
                'An error occured while fetching troop counts!',
            Village: 'Village',
            'Landing Time': 'Landing Time',
            Sigil: 'Sigil',
            'Min. Amount': 'Min. Amount',
            Action: 'Action',
            'Add new Snipe': 'Add new Snipe',
            'Calculate Times': 'Calculate Times',
            From: 'From',
            To: 'To',
            Unit: 'Unit',
            Distance: 'Distance',
            'Launch Time': 'Launch Time',
            'Send in': 'Send in',
            Send: 'Send',
            'No possible snipe options found!':
                'No possible snipe options found!',
            'combinations found': 'combinations found',
            'Export as BB Code': 'Export as BB Code',
            'Nothing to export!': 'Nothing to export!',
            'Copied on clipboard!': 'Copied on clipboard!',
            Command: 'Command',
            Status: 'Status',
            'Reset Script': 'Reset Script',
            'Script configuration has been reset!':
                'Script configuration has been reset!',
            'Already exists!': 'Already exists!',
            'Mass Import': 'Mass Import',
            'Paste text here from a forum thread':
                'Paste text here from a forum thread',
            'There has been an error while parsing the text!':
                'There has been an error while parsing the text!',
            'No trains could be found!': 'No trains could be found!',
            'This field can not be empty!': 'This field can not be empty!',
            // string identifiers which need to be translated for text parser to identify them on other languages
            Noble: 'Noble',
            'Village:': 'Village:',
            'Arrival time:': 'Arrival time:',
        },
        pt_BR: {
            'Mass Snipe': 'Snip em massa',
            Help: 'Ajuda',
            'There was an error!': 'Ocorreu um erro!',
            'There was an error while fetching the data!':
                'Ocorreu um erro ao buscar os dados!',
            'Redirecting...': 'Redirecionando...',
            'There was an error fetching villages by group!':
                'Ocorreu um erro ao buscar aldeias no grupo!',
            'An error occured while fetching troop counts!':
                'Ocorreu um erro ao buscar a quantidade de tropas!',
            Village: 'Aldeia',
            'Landing Time': 'Hora de chegada',
            Sigil: 'Afli\u00e7\u00e3o',
            'Min. Amount': 'Quantidade m\u00edn.',
            Action: 'A\u00e7\u00e3o',
            'Add new Snipe': 'Add novo snip',
            'Calculate Times': 'Calcular tempos',
            From: 'Origem',
            To: 'Destino',
            Unit: 'Unidade',
            Distance: 'Dist\u00e2ncia',
            'Launch Time': 'Hora de sa\u00edda',
            'Send in': 'Enviar em',
            Send: 'Enviar',
            'No possible snipe options found!':
                'Nenhuma op\u00e7\u00e3o poss\u00edvel de snip encontrada!',
            'combinations found': 'combina\u00e7\u00f5es encontradas',
            'Export as BB Code': 'Exportar como C\u00f3digo BB',
            'Nothing to export!': 'Nada para exportar!',
            'Copied on clipboard!':
                'Copiado na \u00e1rea de transfer\u00eancia!',
            Command: 'Comando',
            Status: 'Status',
            'Reset Script': 'Redefinir script',
            'Script configuration has been reset!':
                'A configura\u00e7\u00e3o do script foi redefinida!',
            'Already exists!': 'J\u00e1 existe!',
            'Mass Import': 'Import. em massa',
            'Paste text here from a forum thread':
                'Cole aqui o texto de um t\u00f3pico do f\u00f3rum',
            'There has been an error while parsing the text!':
                'Ocorreu um erro ao analisar o texto!',
            'No trains could be found!': 'Nenhum noble train foi encontrado!',
            'This field can not be empty!':
                'Este campo n\u00e3o pode ficar vazio!',
            // string identifiers which need to be translated for text parser to identify them on other languages
            Noble: 'Nobre',
            'Village:': 'Aldeia:',
            'Arrival time:': 'Arrival time:',
        },
        es_ES: {
            'Mass Snipe': 'Snip en masa',
            Help: 'Ayuda',
            'There was an error!': 'Ocurrió un error!',
            'There was an error while fetching the data!':
                'Se produjo un error al obtener los datos!',
            'Redirecting...': 'Redireccionando...',
            'There was an error fetching villages by group!':
                'Se produjo un error al buscar pueblos por grupo.!',
            'An error occured while fetching troop counts!':
                'Se produjo un error al obtener el recuento de tropas.!',
            Village: 'Pueblo',
            'Landing Time': 'Hora de llegada',
            Sigil: 'Sigil',
            'Min. Amount': 'Cantidad mínima',
            Action: 'Acción',
            'Add new Snipe': 'Añadir nuevo snip',
            'Calculate Times': 'Calcular tiempos',
            From: 'Origen',
            To: 'Destino',
            Unit: 'Unidad',
            Distance: 'Distancia',
            'Launch Time': 'Hora de salida',
            'Send in': 'Mandar',
            Send: 'Enviar',
            'No possible snipe options found!': 'No hay snips posibles!',
            'combinations found': 'Combinaciones encontradas',
            'Export as BB Code': 'Exportar como Código BB',
            'Nothing to export!': 'Nada para exportar!',
            'Copied on clipboard!': 'Copiado portapapeles!',
            Command: 'Orden',
            Status: 'Status',
            'Reset Script': 'Resetear script',
            'Script configuration has been reset!':
                'La configuracion se ha reseteado!',
            'Already exists!': 'Ya existe!',
            'Mass Import': 'Importar en masa',
            'Paste text here from a forum thread':
                'Coloque aquí el texto del foro',
            'There has been an error while parsing the text!':
                'Ocurrió un error la analizar el texto!',
            'No trains could be found!': 'Ningún tren encontrado!',
            'This field can not be empty!': 'Este campo no puede estar vacio!',
            // string identifiers which need to be translated for text parser to identify them on other languages
            Noble: 'Noble',
            'Village:': 'Pueblo:',
            'Arrival time:': 'Arrival time:',
        },
    },
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    isDebug: DEBUG,
    enableCountApi: true,
};

window.twSDK = {
    // variables
    scriptData: {},
    translations: {},
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    enableCountApi: true,
    isDebug: false,
    isMobile: jQuery('#mobileHeader').length > 0,
    delayBetweenRequests: 200,
    // helper variables
    market: game_data.market,
    units: game_data.units,
    village: game_data.village,
    buildings: game_data.village.buildings,
    sitterId: game_data.player.sitter > 0 ? `&t=${game_data.player.id}` : '',
    coordsRegex: /\d{1,3}\|\d{1,3}/g,
    dateTimeMatch:
        /(?:[A-Z][a-z]{2}\s+\d{1,2},\s*\d{0,4}\s+|today\s+at\s+|tomorrow\s+at\s+)\d{1,2}:\d{2}:\d{2}:?\.?\d{0,3}/,
    worldInfoInterface: '/interface.php?func=get_config',
    unitInfoInterface: '/interface.php?func=get_unit_info',
    buildingInfoInterface: '/interface.php?func=get_building_info',
    worldDataVillages: '/map/village.txt',
    worldDataPlayers: '/map/player.txt',
    worldDataTribes: '/map/ally.txt',
    worldDataConquests: '/map/conquer_extended.txt',
    // game constants
    buildingsList: [
        'main',
        'barracks',
        'stable',
        'garage',
        'church',
        'church_f',
        'watchtower',
        'snob',
        'smith',
        'place',
        'statue',
        'market',
        'wood',
        'stone',
        'iron',
        'farm',
        'storage',
        'hide',
        'wall',
    ],
    // https://help.tribalwars.net/wiki/Points
    buildingPoints: {
        main: [
            10, 2, 2, 3, 4, 4, 5, 6, 7, 9, 10, 12, 15, 18, 21, 26, 31, 37, 44,
            53, 64, 77, 92, 110, 133, 159, 191, 229, 274, 330,
        ],
        barracks: [
            16, 3, 4, 5, 5, 7, 8, 9, 12, 14, 16, 20, 24, 28, 34, 42, 49, 59, 71,
            85, 102, 123, 147, 177, 212,
        ],
        stable: [
            20, 4, 5, 6, 6, 9, 10, 12, 14, 17, 21, 25, 29, 36, 43, 51, 62, 74,
            88, 107,
        ],
        garage: [24, 5, 6, 6, 9, 10, 12, 14, 17, 21, 25, 29, 36, 43, 51],
        chuch: [10, 2, 2],
        church_f: [10],
        watchtower: [
            42, 8, 10, 13, 14, 18, 20, 25, 31, 36, 43, 52, 62, 75, 90, 108, 130,
            155, 186, 224,
        ],
        snob: [512],
        smith: [
            19, 4, 4, 6, 6, 8, 10, 11, 14, 16, 20, 23, 28, 34, 41, 49, 58, 71,
            84, 101,
        ],
        place: [0],
        statue: [24],
        market: [
            10, 2, 2, 3, 4, 4, 5, 6, 7, 9, 10, 12, 15, 18, 21, 26, 31, 37, 44,
            53, 64, 77, 92, 110, 133,
        ],
        wood: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        stone: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        iron: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        farm: [
            5, 1, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27,
            32, 38, 46, 55, 66, 80, 95, 115, 137, 165,
        ],
        storage: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        hide: [5, 1, 1, 2, 1, 2, 3, 3, 3, 5],
        wall: [
            8, 2, 2, 2, 3, 3, 4, 5, 5, 7, 9, 9, 12, 15, 17, 20, 25, 29, 36, 43,
        ],
    },
    unitsFarmSpace: {
        spear: 1,
        sword: 1,
        axe: 1,
        archer: 1,
        spy: 2,
        light: 4,
        marcher: 5,
        heavy: 6,
        ram: 5,
        catapult: 8,
        knight: 10,
        snob: 100,
    },
    // https://help.tribalwars.net/wiki/Timber_camp
    // https://help.tribalwars.net/wiki/Clay_pit
    // https://help.tribalwars.net/wiki/Iron_mine
    resPerHour: {
        0: 2,
        1: 30,
        2: 35,
        3: 41,
        4: 47,
        5: 55,
        6: 64,
        7: 74,
        8: 86,
        9: 100,
        10: 117,
        11: 136,
        12: 158,
        13: 184,
        14: 214,
        15: 249,
        16: 289,
        17: 337,
        18: 391,
        19: 455,
        20: 530,
        21: 616,
        22: 717,
        23: 833,
        24: 969,
        25: 1127,
        26: 1311,
        27: 1525,
        28: 1774,
        29: 2063,
        30: 2400,
    },
    watchtowerLevels: [
        1.1, 1.3, 1.5, 1.7, 2, 2.3, 2.6, 3, 3.4, 3.9, 4.4, 5.1, 5.8, 6.7, 7.6,
        8.7, 10, 11.5, 13.1, 15,
    ],

    // internal methods
    _initDebug: function () {
        const scriptInfo = this.scriptInfo();
        console.debug(`${scriptInfo} It works 🚀!`);
        console.debug(`${scriptInfo} HELP:`, this.scriptData.helpLink);
        if (this.isDebug) {
            console.debug(`${scriptInfo} Market:`, game_data.market);
            console.debug(`${scriptInfo} World:`, game_data.world);
            console.debug(`${scriptInfo} Screen:`, game_data.screen);
            console.debug(
                `${scriptInfo} Game Version:`,
                game_data.majorVersion
            );
            console.debug(`${scriptInfo} Game Build:`, game_data.version);
            console.debug(`${scriptInfo} Locale:`, game_data.locale);
            console.debug(
                `${scriptInfo} PA:`,
                game_data.features.Premium.active
            );
            console.debug(
                `${scriptInfo} LA:`,
                game_data.features.FarmAssistent.active
            );
            console.debug(
                `${scriptInfo} AM:`,
                game_data.features.AccountManager.active
            );
        }
    },

    // public methods
    addGlobalStyle: function () {
        return `
            /* Table Styling */
            .ra-table-container { overflow-y: auto; overflow-x: hidden; height: auto; max-height: 400px; }
            .ra-table th { font-size: 14px; }
            .ra-table th label { margin: 0; padding: 0; }
            .ra-table th,
            .ra-table td { padding: 5px; text-align: center; }
            .ra-table td a { word-break: break-all; }
            .ra-table a:focus { color: blue; }
            .ra-table a.btn:focus { color: #fff; }
            .ra-table tr:nth-of-type(2n) td { background-color: #f0e2be }
            .ra-table tr:nth-of-type(2n+1) td { background-color: #fff5da; }

            .ra-table-v2 th,
            .ra-table-v2 td { text-align: left; }

            .ra-table-v3 { border: 2px solid #bd9c5a; }
            .ra-table-v3 th,
            .ra-table-v3 td { border-collapse: separate; border: 1px solid #bd9c5a; text-align: left; }

            /* Inputs */
            .ra-textarea { width: 100%; height: 80px; resize: none; }

            /* Popup */
            .ra-popup-content { width: 360px; }
            .ra-popup-content * { box-sizing: border-box; }
            .ra-popup-content input[type="text"] { padding: 3px; width: 100%; }
            .ra-popup-content .btn-confirm-yes { padding: 3px !important; }
            .ra-popup-content label { display: block; margin-bottom: 5px; font-weight: 600; }
            .ra-popup-content > div { margin-bottom: 15px; }
            .ra-popup-content > div:last-child { margin-bottom: 0 !important; }
            .ra-popup-content textarea { width: 100%; height: 100px; resize: none; }

            /* Elements */
            .ra-details { display: block; margin-bottom: 8px; border: 1px solid #603000; padding: 8px; border-radius: 4px; }
            .ra-details summary { font-weight: 600; cursor: pointer; }
            .ra-details p { margin: 10px 0 0 0; padding: 0; }

            /* Helpers */
            .ra-pa5 { padding: 5px !important; }
            .ra-mt15 { margin-top: 15px !important; }
            .ra-mb10 { margin-bottom: 10px !important; }
            .ra-mb15 { margin-bottom: 15px !important; }
            .ra-tal { text-align: left !important; }
            .ra-tac { text-align: center !important; }
            .ra-tar { text-align: right !important; }

            /* RESPONSIVE */
            @media (max-width: 480px) {
                .ra-fixed-widget {
                    position: relative !important;
                    top: 0;
                    left: 0;
                    display: block;
                    width: auto;
                    height: auto;
                    z-index: 1;
                }

                .ra-box-widget {
                    position: relative;
                    display: block;
                    box-sizing: border-box;
                    width: 97%;
                    height: auto;
                    margin: 10px auto;
                }

                .ra-table {
                    border-collapse: collapse !important;
                }

                .custom-close-button { display: none; }
                .ra-fixed-widget h3 { margin-bottom: 15px; }
                .ra-popup-content { width: 100%; }
            }
        `;
    },
    addScriptToQuickbar: function (name, script, callback) {
        let scriptData = `hotkey=&name=${name}&href=${encodeURI(script)}`;
        let action =
            '/game.php?screen=settings&mode=quickbar_edit&action=quickbar_edit&';

        jQuery.ajax({
            url: action,
            type: 'POST',
            data: scriptData + `&h=${csrf_token}`,
            success: function () {
                if (typeof callback === 'function') {
                    callback();
                }
            },
        });
    },
    arraysIntersection: function () {
        var result = [];
        var lists;

        if (arguments.length === 1) {
            lists = arguments[0];
        } else {
            lists = arguments;
        }

        for (var i = 0; i < lists.length; i++) {
            var currentList = lists[i];
            for (var y = 0; y < currentList.length; y++) {
                var currentValue = currentList[y];
                if (result.indexOf(currentValue) === -1) {
                    var existsInAll = true;
                    for (var x = 0; x < lists.length; x++) {
                        if (lists[x].indexOf(currentValue) === -1) {
                            existsInAll = false;
                            break;
                        }
                    }
                    if (existsInAll) {
                        result.push(currentValue);
                    }
                }
            }
        }
        return result;
    },
    buildUnitsPicker: function (
        selectedUnits = [],
        unitsToIgnore,
        type = 'checkbox'
    ) {
        let unitsTable = ``;

        let thUnits = ``;
        let tableRow = ``;

        game_data.units.forEach((unit) => {
            if (!unitsToIgnore.includes(unit)) {
                let checked = '';
                if (selectedUnits.includes(unit)) {
                    checked = `checked`;
                }

                thUnits += `
                    <th class="ra-tac">
                        <label for="unit_${unit}">
                            <img src="/graphic/unit/unit_${unit}.png">
                        </label>
                    </th>
                `;

                tableRow += `
                    <td class="ra-tac">
                        <input name="ra_chosen_units" type="${type}" ${checked} id="unit_${unit}" class="ra-unit-selector" value="${unit}" />
                    </td>
                `;
            }
        });

        unitsTable = `
            <table class="ra-table ra-table-v2" width="100%" id="raUnitSelector">
                <thead>
                    <tr>
                        ${thUnits}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${tableRow}
                    </tr>
                </tbody>
            </table>
        `;

        return unitsTable;
    },
    calculateCoinsNeededForNthNoble: function (noble) {
        return (noble * noble + noble) / 2;
    },
    calculateDistanceFromCurrentVillage: function (coord) {
        const x1 = game_data.village.x;
        const y1 = game_data.village.y;
        const [x2, y2] = coord.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },
    calculateDistance: function (from, to) {
        const [x1, y1] = from.split('|');
        const [x2, y2] = to.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },
    calculatePercentages: function (amount, total) {
        if (amount === undefined) amount = 0;
        return parseFloat((amount / total) * 100).toFixed(2);
    },
    calculateTimesByDistance: async function (distance) {
        const _self = this;

        const times = [];
        const travelTimes = [];

        const unitInfo = await _self.getWorldUnitInfo();
        const worldConfig = await _self.getWorldConfig();

        for (let [key, value] of Object.entries(unitInfo.config)) {
            times.push(value.speed);
        }

        const { speed, unit_speed } = worldConfig.config;

        times.forEach((time) => {
            let travelTime = Math.round(
                (distance * time * 60) / speed / unit_speed
            );
            travelTime = _self.secondsToHms(travelTime);
            travelTimes.push(travelTime);
        });

        return travelTimes;
    },
    checkValidLocation: function (type) {
        switch (type) {
            case 'screen':
                return this.allowedScreens.includes(
                    this.getParameterByName('screen')
                );
            case 'mode':
                return this.allowedModes.includes(
                    this.getParameterByName('mode')
                );
            default:
                return false;
        }
    },
    checkValidMarket: function () {
        if (this.market === 'yy') return true;
        return this.allowedMarkets.includes(this.market);
    },
    cleanString: function (string) {
        try {
            return decodeURIComponent(string).replace(/\+/g, ' ');
        } catch (error) {
            console.error(error, string);
            return string;
        }
    },
    copyToClipboard: function (string) {
        navigator.clipboard.writeText(string);
    },
    createUUID: function () {
        return crypto.randomUUID();
    },
    csvToArray: function (strData, strDelimiter = ',') {
        var objPattern = new RegExp(
            '(\\' +
                strDelimiter +
                '|\\r?\\n|\\r|^)' +
                '(?:"([^"]*(?:""[^"]*)*)"|' +
                '([^"\\' +
                strDelimiter +
                '\\r\\n]*))',
            'gi'
        );
        var arrData = [[]];
        var arrMatches = null;
        while ((arrMatches = objPattern.exec(strData))) {
            var strMatchedDelimiter = arrMatches[1];
            if (
                strMatchedDelimiter.length &&
                strMatchedDelimiter !== strDelimiter
            ) {
                arrData.push([]);
            }
            var strMatchedValue;

            if (arrMatches[2]) {
                strMatchedValue = arrMatches[2].replace(
                    new RegExp('""', 'g'),
                    '"'
                );
            } else {
                strMatchedValue = arrMatches[3];
            }
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        return arrData;
    },
    decryptAccountManangerTemplate: function (exportedTemplate) {
        const buildings = [];

        const binaryString = atob(exportedTemplate);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const payloadLength = bytes[0] + bytes[1] * 256;
        if (payloadLength <= bytes.length - 2) {
            const payload = bytes.slice(2, 2 + payloadLength);
            for (let i = 0; i < payload.length; i += 2) {
                const buildingId = payload[i];
                const buildingLevel = payload[i + 1];
                if (this.buildingsList[buildingId]) {
                    buildings.push({
                        id: this.buildingsList[buildingId],
                        upgrade: `+${buildingLevel}`,
                    });
                }
            }

            return buildings;
        }
    },
    filterVillagesByPlayerIds: function (playerIds, villages) {
        const playerVillages = [];
        villages.forEach((village) => {
            if (playerIds.includes(parseInt(village[4]))) {
                const coordinate = village[2] + '|' + village[3];
                playerVillages.push(coordinate);
            }
        });
        return playerVillages;
    },
    formatAsNumber: function (number) {
        return parseInt(number).toLocaleString('de');
    },
    formatDateTime: function (dateTime) {
        dateTime = new Date(dateTime);
        return (
            this.zeroPad(dateTime.getDate(), 2) +
            '/' +
            this.zeroPad(dateTime.getMonth() + 1, 2) +
            '/' +
            dateTime.getFullYear() +
            ' ' +
            this.zeroPad(dateTime.getHours(), 2) +
            ':' +
            this.zeroPad(dateTime.getMinutes(), 2) +
            ':' +
            this.zeroPad(dateTime.getSeconds(), 2) +
            ':' +
            this.zeroPad(dateTime.getMilliseconds(), 3)
        );
    },
    frequencyCounter: function (array) {
        return array.reduce(function (acc, curr) {
            if (typeof acc[curr] == 'undefined') {
                acc[curr] = 1;
            } else {
                acc[curr] += 1;
            }
            return acc;
        }, {});
    },
    generateRandomCoordinates: function () {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 1000);
        return `${x}|${y}`;
    },
    getAll: function (
        urls, // array of URLs
        onLoad, // called when any URL is loaded, params (index, data)
        onDone, // called when all URLs successfully loaded, no params
        onError // called when a URL load fails or if onLoad throws an exception, params (error)
    ) {
        var numDone = 0;
        var lastRequestTime = 0;
        var minWaitTime = this.delayBetweenRequests; // ms between requests
        loadNext();
        function loadNext() {
            if (numDone == urls.length) {
                onDone();
                return;
            }

            let now = Date.now();
            let timeElapsed = now - lastRequestTime;
            if (timeElapsed < minWaitTime) {
                let timeRemaining = minWaitTime - timeElapsed;
                setTimeout(loadNext, timeRemaining);
                return;
            }
            lastRequestTime = now;
            jQuery
                .get(urls[numDone])
                .done((data) => {
                    try {
                        onLoad(numDone, data);
                        ++numDone;
                        loadNext();
                    } catch (e) {
                        onError(e);
                    }
                })
                .fail((xhr) => {
                    onError(xhr);
                });
        }
    },
    getBuildingsInfo: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 365; // fetch config only once since they don't change
        const LAST_UPDATED_TIME =
            localStorage.getItem('buildings_info_last_updated') ?? 0;
        let buildingsInfo = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.buildingInfoInterface,
                });
                buildingsInfo = this.xml2json(jQuery(response));
                localStorage.setItem(
                    'buildings_info',
                    JSON.stringify(buildingsInfo)
                );
                localStorage.setItem(
                    'buildings_info_last_updated',
                    Date.parse(new Date())
                );
            } else {
                buildingsInfo = JSON.parse(
                    localStorage.getItem('buildings_info')
                );
            }
        } else {
            const response = await jQuery.ajax({
                url: this.buildingInfoInterface,
            });
            buildingsInfo = this.xml2json(jQuery(response));
            localStorage.setItem('buildings_info', JSON.stringify(unitInfo));
            localStorage.setItem(
                'buildings_info_last_updated',
                Date.parse(new Date())
            );
        }

        return buildingsInfo;
    },
    getContinentByCoord: function (coord) {
        let [x, y] = Array.from(coord.split('|')).map((e) => parseInt(e));
        for (let i = 0; i < 1000; i += 100) {
            //x axes
            for (let j = 0; j < 1000; j += 100) {
                //y axes
                if (i >= x && x < i + 100 && j >= y && y < j + 100) {
                    let nr_continent =
                        parseInt(y / 100) + '' + parseInt(x / 100);
                    return nr_continent;
                }
            }
        }
    },
    getContinentsFromCoordinates: function (coordinates) {
        let continents = [];

        coordinates.forEach((coord) => {
            const continent = twSDK.getContinentByCoord(coord);
            continents.push(continent);
        });

        return [...new Set(continents)];
    },
    getCoordFromString: function (string) {
        if (!string) return [];
        return string.match(this.coordsRegex)[0];
    },
    getContinentSectorField: function (coordinate) {
        const continent = this.getContinentByCoord(coordinate);
        let [coordX, coordY] = coordinate.split('|');

        let tempX = Number(coordX);
        let tempY = Number(coordY);

        //==== sector ====
        if (tempX >= 100) tempX = Number(String(coordX).substring(1));
        if (tempY >= 100) tempY = Number(String(coordY).substring(1));

        let xPos = Math.floor(tempX / 5);
        let yPos = Math.floor(tempY / 5);
        let sector = yPos * 20 + xPos;

        //==== field ====
        if (tempX >= 10) tempX = Number(String(tempX).substring(1));
        if (tempY >= 10) tempY = Number(String(tempY).substring(1));

        if (tempX >= 5) tempX = tempX - 5;
        if (tempY >= 5) tempY = tempY - 5;
        let field = tempY * 5 + tempX;

        let name = continent + ':' + sector + ':' + field;

        return name;
    },
    getDestinationCoordinates: function (config, tribes, players, villages) {
        const {
            playersInput,
            tribesInput,
            continents,
            minCoord,
            maxCoord,
            distCenter,
            center,
            excludedPlayers,
            enable20To1Limit,
            minPoints,
            maxPoints,
            selectiveRandomConfig,
        } = config;

        // get target coordinates
        const chosenPlayers = playersInput.split(',');
        const chosenTribes = tribesInput.split(',');

        const chosenPlayerIds = twSDK.getEntityIdsByArrayIndex(
            chosenPlayers,
            players,
            1
        );
        const chosenTribeIds = twSDK.getEntityIdsByArrayIndex(
            chosenTribes,
            tribes,
            2
        );

        const tribePlayers = twSDK.getTribeMembersById(chosenTribeIds, players);

        const mergedPlayersList = [...tribePlayers, ...chosenPlayerIds];
        let uniquePlayersList = [...new Set(mergedPlayersList)];

        const chosenExcludedPlayers = excludedPlayers.split(',');
        if (chosenExcludedPlayers.length > 0) {
            const excludedPlayersIds = twSDK.getEntityIdsByArrayIndex(
                chosenExcludedPlayers,
                players,
                1
            );
            excludedPlayersIds.forEach((item) => {
                uniquePlayersList = uniquePlayersList.filter(
                    (player) => player !== item
                );
            });
        }

        // filter by 20:1 rule
        if (enable20To1Limit) {
            let uniquePlayersListArray = [];
            uniquePlayersList.forEach((playerId) => {
                players.forEach((player) => {
                    if (parseInt(player[0]) === playerId) {
                        uniquePlayersListArray.push(player);
                    }
                });
            });

            const playersNotBiggerThen20Times = uniquePlayersListArray.filter(
                (player) => {
                    return (
                        parseInt(player[4]) <=
                        parseInt(game_data.player.points) * 20
                    );
                }
            );

            uniquePlayersList = playersNotBiggerThen20Times.map((player) =>
                parseInt(player[0])
            );
        }

        let coordinatesArray = twSDK.filterVillagesByPlayerIds(
            uniquePlayersList,
            villages
        );

        // filter by min and max village points
        if (minPoints || maxPoints) {
            let filteredCoordinatesArray = [];

            coordinatesArray.forEach((coordinate) => {
                villages.forEach((village) => {
                    const villageCoordinate = village[2] + '|' + village[3];
                    if (villageCoordinate === coordinate) {
                        filteredCoordinatesArray.push(village);
                    }
                });
            });

            filteredCoordinatesArray = filteredCoordinatesArray.filter(
                (village) => {
                    const villagePoints = parseInt(village[5]);
                    const minPointsNumber = parseInt(minPoints) || 26;
                    const maxPointsNumber = parseInt(maxPoints) || 12124;
                    if (
                        villagePoints > minPointsNumber &&
                        villagePoints < maxPointsNumber
                    ) {
                        return village;
                    }
                }
            );

            coordinatesArray = filteredCoordinatesArray.map(
                (village) => village[2] + '|' + village[3]
            );
        }

        // filter coordinates by continent
        if (continents.length) {
            let chosenContinentsArray = continents.split(',');
            chosenContinentsArray = chosenContinentsArray.map((item) =>
                item.trim()
            );

            const availableContinents =
                twSDK.getContinentsFromCoordinates(coordinatesArray);
            const filteredVillagesByContinent =
                twSDK.getFilteredVillagesByContinent(
                    coordinatesArray,
                    availableContinents
                );

            const isUserInputValid = chosenContinentsArray.every((item) =>
                availableContinents.includes(item)
            );

            if (isUserInputValid) {
                coordinatesArray = chosenContinentsArray
                    .map((continent) => {
                        if (continent.length && $.isNumeric(continent)) {
                            return [...filteredVillagesByContinent[continent]];
                        } else {
                            return;
                        }
                    })
                    .flat();
            } else {
                return [];
            }
        }

        // filter coordinates by a bounding box of coordinates
        if (minCoord.length && maxCoord.length) {
            const raMinCoordCheck = minCoord.match(twSDK.coordsRegex);
            const raMaxCoordCheck = maxCoord.match(twSDK.coordsRegex);

            if (raMinCoordCheck !== null && raMaxCoordCheck !== null) {
                const [minX, minY] = raMinCoordCheck[0].split('|');
                const [maxX, maxY] = raMaxCoordCheck[0].split('|');

                coordinatesArray = [...coordinatesArray].filter(
                    (coordinate) => {
                        const [x, y] = coordinate.split('|');
                        if (minX <= x && x <= maxX && minY <= y && y <= maxY) {
                            return coordinate;
                        }
                    }
                );
            } else {
                return [];
            }
        }

        // filter by radius
        if (distCenter.length && center.length) {
            if (!$.isNumeric(distCenter)) distCenter = 0;
            const raCenterCheck = center.match(twSDK.coordsRegex);

            if (distCenter !== 0 && raCenterCheck !== null) {
                let coordinatesArrayWithDistance = [];
                coordinatesArray.forEach((coordinate) => {
                    const distance = twSDK.calculateDistance(
                        raCenterCheck[0],
                        coordinate
                    );
                    coordinatesArrayWithDistance.push({
                        coord: coordinate,
                        distance: distance,
                    });
                });

                coordinatesArrayWithDistance =
                    coordinatesArrayWithDistance.filter((item) => {
                        return (
                            parseFloat(item.distance) <= parseFloat(distCenter)
                        );
                    });

                coordinatesArray = coordinatesArrayWithDistance.map(
                    (item) => item.coord
                );
            } else {
                return [];
            }
        }

        // apply multiplier
        if (selectiveRandomConfig) {
            const selectiveRandomizer = selectiveRandomConfig.split(';');

            const makeRepeated = (arr, repeats) =>
                Array.from({ length: repeats }, () => arr).flat();
            const multipliedCoordinatesArray = [];

            selectiveRandomizer.forEach((item) => {
                const [playerName, distribution] = item.split(':');
                if (distribution > 1) {
                    players.forEach((player) => {
                        if (
                            twSDK.cleanString(player[1]) ===
                            twSDK.cleanString(playerName)
                        ) {
                            let playerVillages =
                                twSDK.filterVillagesByPlayerIds(
                                    [parseInt(player[0])],
                                    villages
                                );
                            const flattenedPlayerVillagesArray = makeRepeated(
                                playerVillages,
                                distribution
                            );
                            multipliedCoordinatesArray.push(
                                flattenedPlayerVillagesArray
                            );
                        }
                    });
                }
            });

            coordinatesArray.push(...multipliedCoordinatesArray.flat());
        }

        return coordinatesArray;
    },
    getEntityIdsByArrayIndex: function (chosenItems, items, index) {
        const itemIds = [];
        chosenItems.forEach((chosenItem) => {
            items.forEach((item) => {
                if (
                    twSDK.cleanString(item[index]) ===
                    twSDK.cleanString(chosenItem)
                ) {
                    return itemIds.push(parseInt(item[0]));
                }
            });
        });
        return itemIds;
    },
    getFilteredVillagesByContinent: function (
        playerVillagesCoords,
        continents
    ) {
        let coords = [...playerVillagesCoords];
        let filteredVillagesByContinent = [];

        coords.forEach((coord) => {
            continents.forEach((continent) => {
                let currentVillageContinent = twSDK.getContinentByCoord(coord);
                if (currentVillageContinent === continent) {
                    filteredVillagesByContinent.push({
                        continent: continent,
                        coords: coord,
                    });
                }
            });
        });

        return twSDK.groupArrayByProperty(
            filteredVillagesByContinent,
            'continent',
            'coords'
        );
    },
    getGameFeatures: function () {
        const { Premium, FarmAssistent, AccountManager } = game_data.features;
        const isPA = Premium.active;
        const isLA = FarmAssistent.active;
        const isAM = AccountManager.active;
        return { isPA, isLA, isAM };
    },
    getKeyByValue: function (object, value) {
        return Object.keys(object).find((key) => object[key] === value);
    },
    getLandingTimeFromArrivesIn: function (arrivesIn) {
        const currentServerTime = twSDK.getServerDateTimeObject();
        const [hours, minutes, seconds] = arrivesIn.split(':');
        const totalSeconds = +hours * 3600 + +minutes * 60 + +seconds;
        const arrivalDateTime = new Date(
            currentServerTime.getTime() + totalSeconds * 1000
        );
        return arrivalDateTime;
    },
    getLastCoordFromString: function (string) {
        if (!string) return [];
        const regex = this.coordsRegex;
        let match;
        let lastMatch;
        while ((match = regex.exec(string)) !== null) {
            lastMatch = match;
        }
        return lastMatch ? lastMatch[0] : [];
    },
    getPagesToFetch: function () {
        let list_pages = [];

        const currentPage = twSDK.getParameterByName('page');
        if (currentPage == '-1') return [];

        if (
            document
                .getElementsByClassName('vis')[1]
                .getElementsByTagName('select').length > 0
        ) {
            Array.from(
                document
                    .getElementsByClassName('vis')[1]
                    .getElementsByTagName('select')[0]
            ).forEach(function (item) {
                list_pages.push(item.value);
            });
            list_pages.pop();
        } else if (
            document.getElementsByClassName('paged-nav-item').length > 0
        ) {
            let nr = 0;
            Array.from(
                document.getElementsByClassName('paged-nav-item')
            ).forEach(function (item) {
                let current = item.href;
                current = current.split('page=')[0] + 'page=' + nr;
                nr++;
                list_pages.push(current);
            });
        } else {
            let current_link = window.location.href;
            list_pages.push(current_link);
        }
        list_pages.shift();

        return list_pages;
    },
    getParameterByName: function (name, url = window.location.href) {
        return new URL(url).searchParams.get(name);
    },
    getRelativeImagePath: function (url) {
        const urlParts = url.split('/');
        return `/${urlParts[5]}/${urlParts[6]}/${urlParts[7]}`;
    },
    getServerDateTimeObject: function () {
        const formattedTime = this.getServerDateTime();
        return new Date(formattedTime);
    },
    getServerDateTime: function () {
        const serverTime = jQuery('#serverTime').text();
        const serverDate = jQuery('#serverDate').text();
        const [day, month, year] = serverDate.split('/');
        const serverTimeFormatted =
            year + '-' + month + '-' + day + ' ' + serverTime;
        return serverTimeFormatted;
    },
    getTimeFromString: function (timeLand) {
        let dateLand = '';
        let serverDate = document
            .getElementById('serverDate')
            .innerText.split('/');

        let TIME_PATTERNS = {
            today: 'today at %s',
            tomorrow: 'tomorrow at %s',
            later: 'on %1 at %2',
        };

        if (window.lang) {
            TIME_PATTERNS = {
                today: window.lang['aea2b0aa9ae1534226518faaefffdaad'],
                tomorrow: window.lang['57d28d1b211fddbb7a499ead5bf23079'],
                later: window.lang['0cb274c906d622fa8ce524bcfbb7552d'],
            };
        }

        let todayPattern = new RegExp(
            TIME_PATTERNS.today.replace('%s', '([\\d+|:]+)')
        ).exec(timeLand);
        let tomorrowPattern = new RegExp(
            TIME_PATTERNS.tomorrow.replace('%s', '([\\d+|:]+)')
        ).exec(timeLand);
        let laterDatePattern = new RegExp(
            TIME_PATTERNS.later
                .replace('%1', '([\\d+|\\.]+)')
                .replace('%2', '([\\d+|:]+)')
        ).exec(timeLand);

        if (todayPattern !== null) {
            // today
            dateLand =
                serverDate[0] +
                '/' +
                serverDate[1] +
                '/' +
                serverDate[2] +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        } else if (tomorrowPattern !== null) {
            // tomorrow
            let tomorrowDate = new Date(
                serverDate[1] + '/' + serverDate[0] + '/' + serverDate[2]
            );
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            dateLand =
                ('0' + tomorrowDate.getDate()).slice(-2) +
                '/' +
                ('0' + (tomorrowDate.getMonth() + 1)).slice(-2) +
                '/' +
                tomorrowDate.getFullYear() +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        } else {
            // on
            let on = timeLand.match(/\d+.\d+/)[0].split('.');
            dateLand =
                on[0] +
                '/' +
                on[1] +
                '/' +
                serverDate[2] +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        }

        return dateLand;
    },
    getTravelTimeInSecond: function (distance, unitSpeed) {
        let travelTime = distance * unitSpeed * 60;
        if (travelTime % 1 > 0.5) {
            return (travelTime += 1);
        } else {
            return travelTime;
        }
    },
    getTribeMembersById: function (tribeIds, players) {
        const tribeMemberIds = [];
        players.forEach((player) => {
            if (tribeIds.includes(parseInt(player[2]))) {
                tribeMemberIds.push(parseInt(player[0]));
            }
        });
        return tribeMemberIds;
    },
    getTroop: function (unit) {
        return parseInt(
            document.units[unit].parentNode
                .getElementsByTagName('a')[1]
                .innerHTML.match(/\d+/),
            10
        );
    },
    getVillageBuildings: function () {
        const buildings = game_data.village.buildings;
        const villageBuildings = [];

        for (let [key, value] of Object.entries(buildings)) {
            if (value > 0) {
                villageBuildings.push({
                    building: key,
                    level: value,
                });
            }
        }

        return villageBuildings;
    },
    getWorldConfig: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 7;
        const LAST_UPDATED_TIME =
            localStorage.getItem('world_config_last_updated') ?? 0;
        let worldConfig = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.worldInfoInterface,
                });
                worldConfig = this.xml2json(jQuery(response));
                localStorage.setItem(
                    'world_config',
                    JSON.stringify(worldConfig)
                );
                localStorage.setItem(
                    'world_config_last_updated',
                    Date.parse(new Date())
                );
            } else {
                worldConfig = JSON.parse(localStorage.getItem('world_config'));
            }
        } else {
            const response = await jQuery.ajax({
                url: this.worldInfoInterface,
            });
            worldConfig = this.xml2json(jQuery(response));
            localStorage.setItem('world_config', JSON.stringify(unitInfo));
            localStorage.setItem(
                'world_config_last_updated',
                Date.parse(new Date())
            );
        }

        return worldConfig;
    },
    getWorldUnitInfo: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 7;
        const LAST_UPDATED_TIME =
            localStorage.getItem('units_info_last_updated') ?? 0;
        let unitInfo = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.unitInfoInterface,
                });
                unitInfo = this.xml2json(jQuery(response));
                localStorage.setItem('units_info', JSON.stringify(unitInfo));
                localStorage.setItem(
                    'units_info_last_updated',
                    Date.parse(new Date())
                );
            } else {
                unitInfo = JSON.parse(localStorage.getItem('units_info'));
            }
        } else {
            const response = await jQuery.ajax({
                url: this.unitInfoInterface,
            });
            unitInfo = this.xml2json(jQuery(response));
            localStorage.setItem('units_info', JSON.stringify(unitInfo));
            localStorage.setItem(
                'units_info_last_updated',
                Date.parse(new Date())
            );
        }

        return unitInfo;
    },
    groupArrayByProperty: function (array, property, filter) {
        return array.reduce(function (accumulator, object) {
            // get the value of our object(age in our case) to use for group    the array as the array key
            const key = object[property];
            // if the current value is similar to the key(age) don't accumulate the transformed array and leave it empty
            if (!accumulator[key]) {
                accumulator[key] = [];
            }
            // add the value to the array
            accumulator[key].push(object[filter]);
            // return the transformed array
            return accumulator;
            // Also we also set the initial value of reduce() to an empty object
        }, {});
    },
    isArcherWorld: function () {
        return this.units.includes('archer');
    },
    isChurchWorld: function () {
        return 'church' in this.village.buildings;
    },
    isPaladinWorld: function () {
        return this.units.includes('knight');
    },
    isWatchTowerWorld: function () {
        return 'watchtower' in this.village.buildings;
    },
    loadJS: function (url, callback) {
        let scriptTag = document.createElement('script');
        scriptTag.src = url;
        scriptTag.onload = callback;
        scriptTag.onreadystatechange = callback;
        document.body.appendChild(scriptTag);
    },
    redirectTo: function (location) {
        window.location.assign(game_data.link_base_pure + location);
    },
    removeDuplicateObjectsFromArray: function (array, prop) {
        return array.filter((obj, pos, arr) => {
            return arr.map((mapObj) => mapObj[prop]).indexOf(obj[prop]) === pos;
        });
    },
    renderBoxWidget: function (body, id, mainClass, customStyle) {
        const globalStyle = this.addGlobalStyle();

        const content = `
            <div class="${mainClass} ra-box-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(this.scriptData.name)}</h3>
                </div>
                <div class="${mainClass}-body">
                    ${body}
                </div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>
                            ${this.tt(this.scriptData.name)} ${
            this.scriptData.version
        }
                        </strong> -
                        <a href="${
                            this.scriptData.authorUrl
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.scriptData.author}
                        </a> -
                        <a href="${
                            this.scriptData.helpLink
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.tt('Help')}
                        </a>
                    </small>
                </div>
            </div>
            <style>
                .${mainClass} { position: relative; display: block; width: 100%; height: auto; clear: both; margin: 10px 0 15px; border: 1px solid #603000; box-sizing: border-box; background: #f4e4bc; }
                .${mainClass} * { box-sizing: border-box; }
                .${mainClass} > div { padding: 10px; }
                .${mainClass} .btn-confirm-yes { padding: 3px; }
                .${mainClass}-header { display: flex; align-items: center; justify-content: space-between; background-color: #c1a264 !important; background-image: url(/graphic/screen/tableheader_bg3.png); background-repeat: repeat-x; }
                .${mainClass}-header h3 { margin: 0; padding: 0; line-height: 1; }
                .${mainClass}-body p { font-size: 14px; }
                .${mainClass}-body label { display: block; font-weight: 600; margin-bottom: 6px; }
                
                ${globalStyle}

                /* Custom Style */
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            jQuery('#contentContainer').prepend(content);
            jQuery('#mobileContent').prepend(content);
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },
    renderFixedWidget: function (
        body,
        id,
        mainClass,
        customStyle,
        width,
        customName = this.scriptData.name
    ) {
        const globalStyle = this.addGlobalStyle();

        const content = `
            <div class="${mainClass} ra-fixed-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(customName)}</h3>
                </div>
                <div class="${mainClass}-body">
                    ${body}
                </div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>
                            ${this.tt(customName)} ${this.scriptData.version}
                        </strong> -
                        <a href="${
                            this.scriptData.authorUrl
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.scriptData.author}
                        </a> -
                        <a href="${
                            this.scriptData.helpLink
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.tt('Help')}
                        </a>
                    </small>
                </div>
                <a class="popup_box_close custom-close-button" href="#">&nbsp;</a>
            </div>
            <style>
                .${mainClass} { position: fixed; top: 10vw; right: 10vw; z-index: 99999; border: 2px solid #7d510f; border-radius: 10px; padding: 10px; width: ${
            width ?? '360px'
        }; overflow-y: auto; padding: 10px; background: #e3d5b3 url('/graphic/index/main_bg.jpg') scroll right top repeat; }
                .${mainClass} * { box-sizing: border-box; }

                ${globalStyle}

                /* Custom Style */
                .custom-close-button { right: 0; top: 0; }
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            if (mobiledevice) {
                jQuery('#content_value').prepend(content);
            } else {
                jQuery('#contentContainer').prepend(content);
                jQuery(`#${id}`).draggable({
                    cancel: '.ra-table, input, textarea, button, select, option',
                });

                jQuery(`#${id} .custom-close-button`).on('click', function (e) {
                    e.preventDefault();
                    jQuery(`#${id}`).remove();
                });
            }
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },
    scriptInfo: function (scriptData = this.scriptData) {
        return `[${scriptData.name} ${scriptData.version}]`;
    },
    secondsToHms: function (timestamp) {
        const hours = Math.floor(timestamp / 60 / 60);
        const minutes = Math.floor(timestamp / 60) - hours * 60;
        const seconds = timestamp % 60;
        return (
            hours.toString().padStart(2, '0') +
            ':' +
            minutes.toString().padStart(2, '0') +
            ':' +
            seconds.toString().padStart(2, '0')
        );
    },
    setUpdateProgress: function (elementToUpdate, valueToSet) {
        jQuery(elementToUpdate).text(valueToSet);
    },
    sortArrayOfObjectsByKey: function (array, key) {
        return array.sort((a, b) => b[key] - a[key]);
    },
    startProgressBar: function (total) {
        const width = jQuery('#content_value')[0].clientWidth;
        const preloaderContent = `
            <div id="progressbar" class="progress-bar" style="margin-bottom:12px;">
                <span class="count label">0/${total}</span>
                <div id="progress">
                    <span class="count label" style="width: ${width}px;">
                        0/${total}
                    </span>
                </div>
            </div>
        `;

        if (this.isMobile) {
            jQuery('#content_value').eq(0).prepend(preloaderContent);
        } else {
            jQuery('#contentContainer').eq(0).prepend(preloaderContent);
        }
    },
    sumOfArrayItemValues: function (array) {
        return array.reduce((a, b) => a + b, 0);
    },
    randomItemPickerString: function (items, splitter = ' ') {
        const itemsArray = items.split(splitter);
        const chosenIndex = Math.floor(Math.random() * itemsArray.length);
        return itemsArray[chosenIndex];
    },
    randomItemPickerArray: function (items) {
        const chosenIndex = Math.floor(Math.random() * items.length);
        return items[chosenIndex];
    },
    timeAgo: function (seconds) {
        var interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + ' Y';

        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + ' M';

        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + ' D';

        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + ' H';

        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + ' m';

        return Math.floor(seconds) + ' s';
    },
    tt: function (string) {
        if (this.translations[game_data.locale] !== undefined) {
            return this.translations[game_data.locale][string];
        } else {
            return this.translations['en_DK'][string];
        }
    },
    toggleUploadButtonStatus: function (elementToToggle) {
        jQuery(elementToToggle).attr('disabled', (i, v) => !v);
    },
    updateProgress: function (elementToUpate, itemsLength, index) {
        jQuery(elementToUpate).text(`${index}/${itemsLength}`);
    },
    updateProgressBar: function (index, total) {
        jQuery('#progress').css('width', `${((index + 1) / total) * 100}%`);
        jQuery('.count').text(`${index + 1}/${total}`);
        if (index + 1 == total) {
            jQuery('#progressbar').fadeOut(1000);
        }
    },
    xml2json: function ($xml) {
        let data = {};
        const _self = this;
        $.each($xml.children(), function (i) {
            let $this = $(this);
            if ($this.children().length > 0) {
                data[$this.prop('tagName')] = _self.xml2json($this);
            } else {
                data[$this.prop('tagName')] = $.trim($this.text());
            }
        });
        return data;
    },
    worldDataAPI: async function (entity) {
        const TIME_INTERVAL = 60 * 60 * 1000; // fetch data every hour
        const LAST_UPDATED_TIME = localStorage.getItem(
            `${entity}_last_updated`
        );

        // check if entity is allowed and can be fetched
        const allowedEntities = ['village', 'player', 'ally', 'conquer'];
        if (!allowedEntities.includes(entity)) {
            throw new Error(`Entity ${entity} does not exist!`);
        }

        // initial world data
        const worldData = {};

        const dbConfig = {
            village: {
                dbName: 'villagesDb',
                dbTable: 'villages',
                key: 'villageId',
                url: twSDK.worldDataVillages,
            },
            player: {
                dbName: 'playersDb',
                dbTable: 'players',
                key: 'playerId',
                url: twSDK.worldDataPlayers,
            },
            ally: {
                dbName: 'tribesDb',
                dbTable: 'tribes',
                key: 'tribeId',
                url: twSDK.worldDataTribes,
            },
            conquer: {
                dbName: 'conquerDb',
                dbTable: 'conquer',
                key: '',
                url: twSDK.worldDataConquests,
            },
        };

        // Helpers: Fetch entity data and save to localStorage
        const fetchDataAndSave = async () => {
            const DATA_URL = dbConfig[entity].url;

            try {
                // fetch data
                const response = await jQuery.ajax(DATA_URL);
                const data = twSDK.csvToArray(response);
                let responseData = [];

                // prepare data to be saved in db
                switch (entity) {
                    case 'village':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    villageId: parseInt(item[0]),
                                    villageName: twSDK.cleanString(item[1]),
                                    villageX: item[2],
                                    villageY: item[3],
                                    playerId: parseInt(item[4]),
                                    villagePoints: parseInt(item[5]),
                                    villageType: parseInt(item[6]),
                                };
                            });
                        break;
                    case 'player':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    playerId: parseInt(item[0]),
                                    playerName: twSDK.cleanString(item[1]),
                                    tribeId: parseInt(item[2]),
                                    villages: parseInt(item[3]),
                                    points: parseInt(item[4]),
                                    rank: parseInt(item[5]),
                                };
                            });
                        break;
                    case 'ally':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    tribeId: parseInt(item[0]),
                                    tribeName: twSDK.cleanString(item[1]),
                                    tribeTag: twSDK.cleanString(item[2]),
                                    players: parseInt(item[3]),
                                    villages: parseInt(item[4]),
                                    points: parseInt(item[5]),
                                    allPoints: parseInt(item[6]),
                                    rank: parseInt(item[7]),
                                };
                            });
                        break;
                    case 'conquer':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    villageId: parseInt(item[0]),
                                    unixTimestamp: parseInt(item[1]),
                                    newPlayerId: parseInt(item[2]),
                                    newPlayerId: parseInt(item[3]),
                                    oldTribeId: parseInt(item[4]),
                                    newTribeId: parseInt(item[5]),
                                    villagePoints: parseInt(item[6]),
                                };
                            });
                        break;
                    default:
                        return [];
                }

                // save data in db
                saveToIndexedDbStorage(
                    dbConfig[entity].dbName,
                    dbConfig[entity].dbTable,
                    dbConfig[entity].key,
                    responseData
                );

                // update last updated localStorage item
                localStorage.setItem(
                    `${entity}_last_updated`,
                    Date.parse(new Date())
                );

                return responseData;
            } catch (error) {
                throw Error(`Error fetching ${DATA_URL}`);
            }
        };

        // Helpers: Save to IndexedDb storage
        async function saveToIndexedDbStorage(dbName, table, keyId, data) {
            const dbConnect = indexedDB.open(dbName);

            dbConnect.onupgradeneeded = function () {
                const db = dbConnect.result;
                if (keyId.length) {
                    db.createObjectStore(table, {
                        keyPath: keyId,
                    });
                } else {
                    db.createObjectStore(table, {
                        autoIncrement: true,
                    });
                }
            };

            dbConnect.onsuccess = function () {
                const db = dbConnect.result;
                const transaction = db.transaction(table, 'readwrite');
                const store = transaction.objectStore(table);
                store.clear(); // clean store from items before adding new ones

                data.forEach((item) => {
                    store.put(item);
                });

                UI.SuccessMessage('Database updated!');
            };
        }

        // Helpers: Read all villages from indexedDB
        function getAllData(dbName, table) {
            return new Promise((resolve, reject) => {
                const dbConnect = indexedDB.open(dbName);

                dbConnect.onsuccess = () => {
                    const db = dbConnect.result;

                    const dbQuery = db
                        .transaction(table, 'readwrite')
                        .objectStore(table)
                        .getAll();

                    dbQuery.onsuccess = (event) => {
                        resolve(event.target.result);
                    };

                    dbQuery.onerror = (event) => {
                        reject(event.target.error);
                    };
                };

                dbConnect.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        // Helpers: Transform an array of objects into an array of arrays
        function objectToArray(arrayOfObjects, entity) {
            switch (entity) {
                case 'village':
                    return arrayOfObjects.map((item) => [
                        item.villageId,
                        item.villageName,
                        item.villageX,
                        item.villageY,
                        item.playerId,
                        item.villagePoints,
                        item.villageType,
                    ]);
                case 'player':
                    return arrayOfObjects.map((item) => [
                        item.playerId,
                        item.playerName,
                        item.tribeId,
                        item.villages,
                        item.points,
                        item.rank,
                    ]);
                case 'ally':
                    return arrayOfObjects.map((item) => [
                        item.tribeId,
                        item.tribeName,
                        item.tribeTag,
                        item.players,
                        item.villages,
                        item.points,
                        item.allPoints,
                        item.rank,
                    ]);
                case 'conquer':
                    return arrayOfObjects.map((item) => [
                        item.villageId,
                        item.unixTimestamp,
                        item.newPlayerId,
                        item.newPlayerId,
                        item.oldTribeId,
                        item.newTribeId,
                        item.villagePoints,
                    ]);
                default:
                    return [];
            }
        }

        // decide what to do based on current time and last updated entity time
        if (LAST_UPDATED_TIME !== null) {
            if (
                Date.parse(new Date()) >=
                parseInt(LAST_UPDATED_TIME) + TIME_INTERVAL
            ) {
                worldData[entity] = await fetchDataAndSave();
            } else {
                worldData[entity] = await getAllData(
                    dbConfig[entity].dbName,
                    dbConfig[entity].dbTable
                );
            }
        } else {
            worldData[entity] = await fetchDataAndSave();
        }

        // transform the data so at the end an array of array is returned
        worldData[entity] = objectToArray(worldData[entity], entity);

        return worldData[entity];
    },
    zeroPad: function (num, count) {
        var numZeropad = num + '';
        while (numZeropad.length < count) {
            numZeropad = '0' + numZeropad;
        }
        return numZeropad;
    },

    // initialize library
    init: async function (scriptConfig) {
        const {
            scriptData,
            translations,
            allowedMarkets,
            allowedScreens,
            allowedModes,
            isDebug,
            enableCountApi,
        } = scriptConfig;

        this.scriptData = scriptData;
        this.translations = translations;
        this.allowedMarkets = allowedMarkets;
        this.allowedScreens = allowedScreens;
        this.allowedModes = allowedModes;
        this.enableCountApi = enableCountApi;
        this.isDebug = isDebug;

        twSDK._initDebug();
    },
};

(async function () {
    // Initialize Library
    await twSDK.init(scriptConfig);
    const scriptInfo = twSDK.scriptInfo();

    const DEFAULT_VALUES = {
        SELECTED_UNITS: ['spear', 'sword', 'archer', 'heavy'],
    };

    const { worldUnitInfo, villages } = await fetchWorldConfigData();

    // Entry Point
    (async function () {
        try {
            // build user interface
            buildUI();

            // register event handlers
            handleAddNewSnipeNeeded();
            handleRemoveSnipeNeeded();
            handleCalculateTimes();
            handleAddSnipeNeededFromDOM();
            handleMassImport();
            handleExportBBCode();
            handleResetScript();
        } catch (error) {
            UI.ErrorMessage(twSDK.tt('There was an error!'));
            console.error(`${scriptInfo} Error:`, error);
        }
    })();

    // Render: Build user interface
    function buildUI() {
        const { selectedUnits, snipesNeeded } = initDefaultValues();

        const unitPickerHtml = twSDK.buildUnitsPicker(selectedUnits, [
            'spy',
            'militia',
        ]);
        const snipesNeededTable = buildSnipesNeededTable(snipesNeeded);

        const content = `
                <div class="ra-mb15">
                    ${unitPickerHtml}
                </div>
                <div class="ra-mb15">
                    ${snipesNeededTable}
                </div>
                <div>
                    <a href="javascript:void(0);" id="raCalculateTimesBtn" class="btn">
                        ${twSDK.tt('Calculate Times')}
                    </a>
                    <a href="javascript:void(0);" id="raMassImportBtn" class="btn">
                        ${twSDK.tt('Mass Import')}
                    </a>
                    <a href="javascript:void(0);" id="raExportBBCodeBtn" class="btn">
                        ${twSDK.tt('Export as BB Code')}
                    </a>
                    <a href="javascript:void(0);" id="raResetScriptBtn" class="btn">
                        ${twSDK.tt('Reset Script')}
                    </a>
                </div>
                <div id="raSnipes" class="ra-mt15" style="display:none;">
                    <label class="ra-label"><span id="raPossibleCombinationsCount">0</span> ${twSDK.tt(
                        'combinations found'
                    )}</label>
                    <div id="raPossibleCombinationsTable"></div>
                </div>
            `;

        const customStyle = `
                .ra-table-v2 th { font-size: 12px; }
                .ra-table-v2 th, .ra-table-v2 td { text-align: center; border: 1px solid #c4a566; }
                .ra-table-v2 th label, .ra-table-v2 td input[type="checkbox"] { cursor: pointer; }
                .ra-label { display: block; font-weight: 600; margin-bottom: 5px; }
                .ra-input { display: block; width: 100%; height: auto; padding: 5px; font-size: 14px; }
                .ra-chosen-command td { background-color: #ffe563 !important; }
            `;

        twSDK.renderBoxWidget(
            content,
            scriptConfig.scriptData.prefix,
            'ra-mass-snipe',
            customStyle
        );
    }

    // Action Handler: Add new snipe needed
    function handleAddNewSnipeNeeded() {
        jQuery('#raAddNewSnipeNeededBtn').on('click', function (e) {
            e.preventDefault();

            addTableRow();
        });
    }

    // Action Handler: Remove a snipe
    function handleRemoveSnipeNeeded() {
        jQuery('.ra-remove-snipe').on('click', function (e) {
            e.preventDefault();

            jQuery(this).parent().parent().remove();
        });
    }

    // Action Handler: Calculate launch times and find possible snipes
    function handleCalculateTimes() {
        jQuery('#raCalculateTimesBtn').on('click', async function (e) {
            e.preventDefault();

            const { selectedUnits, snipesNeeded } = collectUserInput();
            saveUserInput({ selectedUnits, snipesNeeded });

            const ownVillages = await fetchAllPlayerVillagesByGroup(
                game_data.group_id
            );
            const troopCounts = await fetchTroopsForCurrentGroup(
                game_data.group_id
            );

            let possibleSnipes = [];
            let realSnipes = [];

            ownVillages.forEach((village) => {
                const { id, coords, name } = village;

                snipesNeeded.forEach((snipeNeeded) => {
                    const { coord, landingTime, sigil, minAmount } =
                        snipeNeeded;
                    const distance = twSDK.calculateDistance(coord, coords);
                    const landingTimeObj = getLandingTime(landingTime);

                    selectedUnits.forEach((unit) => {
                        const launchTime = getLaunchTime(
                            unit,
                            landingTimeObj,
                            distance,
                            sigil
                        );
                        if (
                            launchTime >
                                twSDK.getServerDateTimeObject().getTime() &&
                            distance > 0
                        ) {
                            const formattedLaunchTime =
                                twSDK.formatDateTime(launchTime);
                            possibleSnipes.push({
                                id: id,
                                name: name,
                                unit: unit,
                                fromCoord: coords,
                                toCoord: coord,
                                distance: distance,
                                launchTime: launchTime,
                                formattedLaunchTime: formattedLaunchTime,
                                minAmount: minAmount,
                                landingTime:
                                    twSDK.formatDateTime(landingTimeObj),
                            });
                        }
                    });
                });
            });

            possibleSnipes.sort((a, b) => {
                return a.launchTime - b.launchTime;
            });

            possibleSnipes.forEach((snipe) => {
                const { id, unit, minAmount } = snipe;
                troopCounts.forEach((villageTroops) => {
                    if (
                        villageTroops.villageId === id &&
                        villageTroops[unit] >= minAmount
                    ) {
                        snipe = {
                            ...snipe,
                            unitAmount: villageTroops[unit],
                        };
                        realSnipes.push(snipe);
                    }
                });
            });

            if (realSnipes.length) {
                const snipesTableHtml = buildCombinationsTable(realSnipes);
                jQuery('#raSnipes').show();
                jQuery('#raPossibleCombinationsCount').text(realSnipes.length);
                jQuery('#raPossibleCombinationsTable').html(snipesTableHtml);

                localStorage.setItem(
                    `${scriptConfig.scriptData.prefix}_snipes`,
                    JSON.stringify(realSnipes)
                );

                startCountdownMs();
            } else {
                UI.ErrorMessage(twSDK.tt('No possible snipe options found!'));
                jQuery('#raSnipes').hide();
                jQuery('#raPossibleCombinationsCount').text(0);
                jQuery('#raPossibleCombinationsTable').html('');
                localStorage.removeItem(
                    `${scriptConfig.scriptData.prefix}_snipes`
                );
            }
        });
    }

    // Action Handler: Add snipe needed on table from DOM
    function handleAddSnipeNeededFromDOM() {
        // add from "/game.php?screen=info_village&id=XXXX" screen
        jQuery(
            '#commands_outgoings table tbody tr.command-row, #commands_incomings table tbody tr.command-row'
        ).on('click', function () {
            try {
                jQuery(
                    '#commands_outgoings table tbody tr.command-row'
                ).removeClass('ra-chosen-command');
                jQuery(this).addClass('ra-chosen-command');

                const commandLandingTime = jQuery(this)
                    .find('td:eq(1)')
                    .text()
                    .trim();
                const landingTime = twSDK.getTimeFromString(commandLandingTime);

                const [x, y] = window.location.href.split('#')[1].split(';');

                addTableRow(`${x}|${y}`, landingTime);
            } catch (error) {
                UI.ErrorMessage(twSDK.tt('There was an error!'));
                console.error(`${scriptInfo} Error: `, error);
            }
        });

        // add from "/game.php?screen=overview_villages&mode=incomings" screen
        jQuery('#incomings_table tbody tr').on('click', function (e) {
            e.preventDefault();

            try {
                jQuery(this).addClass('ra-chosen-command');

                const destination = jQuery(this)
                    .find('td:eq(1)')
                    .text()
                    .match(twSDK.coordsRegex)[0];
                const landingTimeString = jQuery(this)
                    .find('td:eq(5)')
                    .text()
                    .trim();
                const landingTime = twSDK.getTimeFromString(landingTimeString);

                addTableRow(destination, landingTime);
            } catch (error) {
                UI.ErrorMessage(twSDK.tt('There was an error!'));
                console.error(`${scriptInfo} Error: `, error);
            }
        });
    }

    // Action Handler: Mass Import incomings that need to be sniped
    function handleMassImport() {
        jQuery('#raMassImportBtn').on('click', function (e) {
            e.preventDefault();

            const content = `
                    <div class="ra-popup-content">
                        <div class="ra-mb15">
                            <label class="ra-label" for="raMassImportTextarea">${twSDK.tt(
                                'Paste text here from a forum thread'
                            )}</label>
                            <textarea class="ra-textarea" id="raMassImportTextarea"></textarea>
                        </div>
                        <div class="ra-mb15">
                            <a href="javascript:void(0);" id="raMassImportExecuteBtn" class="btn">
                                ${twSDK.tt('Mass Import')}
                            </a>
                        </div>
                    </div>
                `;

            Dialog.show('content', content);

            jQuery('#raMassImportExecuteBtn').on('click', function (e) {
                e.preventDefault();

                const text = jQuery('#raMassImportTextarea').val().trim();

                if (text === '') {
                    UI.ErrorMessage(twSDK.tt('This field can not be empty!'));
                    return;
                }

                const parsedData = parseTrains(text);

                if (parsedData.length) {
                    parsedData.forEach((villageToBeSniped) => {
                        const { destination, snipeNeeded } = villageToBeSniped;
                        snipeNeeded.forEach((landingTime) => {
                            const date = new Date(landingTime);
                            const formattedDate = twSDK.formatDateTime(date);
                            addTableRow(destination, formattedDate);
                        });
                    });
                } else {
                    UI.InfoMessage(twSDK.tt('No trains could be found!'));
                }
            });
        });
    }

    // Action Handler: Export combinations as BB code
    function handleExportBBCode() {
        jQuery('#raExportBBCodeBtn').on('click', function (e) {
            e.preventDefault();

            const snipes =
                JSON.parse(
                    localStorage.getItem(
                        `${scriptConfig.scriptData.prefix}_snipes`
                    )
                ) ?? [];

            if (snipes.length) {
                const bbCodeSnipes = getBBCodeExport(snipes);
                twSDK.copyToClipboard(bbCodeSnipes);
                UI.SuccessMessage(twSDK.tt('Copied on clipboard!'));
            } else {
                UI.ErrorMessage(twSDK.tt('Nothing to export!'));
            }
        });
    }

    // Action Handler: Reset script configuration
    function handleResetScript() {
        jQuery('#raResetScriptBtn').on('click', function (e) {
            e.preventDefault();

            const localStorageKeys = Object.keys(localStorage);
            const sessionStorageKeys = Object.keys(sessionStorage);

            localStorageKeys.forEach((key) => {
                if (key.startsWith(`${scriptConfig.scriptData.prefix}_`)) {
                    localStorage.removeItem(key);
                }
            });

            sessionStorageKeys.forEach((key) => {
                if (key.startsWith(`${scriptConfig.scriptData.prefix}_`)) {
                    sessionStorage.removeItem(key);
                }
            });

            UI.SuccessMessage(twSDK.tt('Script configuration has been reset!'));

            setTimeout(function () {
                window.location.reload();
            }, 500);
        });
    }

    // Helper: Render Combinations Table
    function buildCombinationsTable(snipes) {
        let combinationsTable = `
                <table class="ra-table ra-table-v2" width="100%">
                    <thead>
                        <tr>
                            <th>
                                #
                            </th>
                            <th class="ra-text-left">
                                ${twSDK.tt('From')}
                            </th>
                            <th class="ra-text-left">
                                ${twSDK.tt('To')}
                            </th>
                            <th>
                                ${twSDK.tt('Unit')}
                            </th>
                            <th class="ra-hide-on-mobile">
                                ${twSDK.tt('Distance')}
                            </th>
                            <th>
                                ${twSDK.tt('Launch Time')}
                            </th>
                            <th>
                                ${twSDK.tt('Send in')}
                            </th>
                            <th>
                                ${twSDK.tt('Send')}
                            </th>
                        </tr>
                    </thead>
                <tbody>
            `;

        const serverTime = getCurrentServerTimeMs();

        snipes.forEach((snipe, index) => {
            const {
                id,
                fromCoord,
                toCoord,
                unit,
                distance,
                launchTime,
                formattedLaunchTime,
                unitAmount,
            } = snipe;
            const [toX, toY] = toCoord.split('|');
            const timeTillLaunch = formatDurationMs(launchTime - serverTime);

            const toCoordData = villages.find(
                (village) => village[2] + '|' + village[3] === toCoord
            );

            let commandUrl = '';
            if (game_data.player.sitter > 0) {
                commandUrl = `/game.php?t=${game_data.player.id}&village=${id}&screen=place&x=${toX}&y=${toY}&${unit}=${unitAmount}`;
            } else {
                commandUrl = `/game.php?village=${id}&screen=place&x=${toX}&y=${toY}&${unit}=${unitAmount}`;
            }

            combinationsTable += `
                    <tr>
                        <td>
                            ${index + 1}
                        </td>
                        <td class="ra-text-left">
                            <a href="${
                                game_data.link_base_pure
                            }info_village&id=${id}" target="_blank" rel="noopener noreferrer">
                                ${fromCoord}
                            </a>
                        </td>
                        <td>
                            <a href="${
                                game_data.link_base_pure
                            }info_village&id=${
                toCoordData[0]
            }" target="_blank" rel="noopener noreferrer">
                                ${toCoord}
                            </a>
                        </td>
                        <td>
                            <img src="/graphic/unit/unit_${unit}.webp" /> <span class="ra-unit-count">${twSDK.formatAsNumber(
                unitAmount
            )}</span>
                        </td>
                        <td class="ra-hide-on-mobile">
                            ${parseFloat(distance).toFixed(2)}
                        </td>
                        <td>
                            ${formattedLaunchTime}
                        </td>
                        <td>
                            <span class="ra-countdown-ms" data-endtime-ms="${launchTime}">${timeTillLaunch}</span>
                        </td>
                        <td>
                            <a href="${commandUrl}" target="_blank" rel="noopener noreferrer" class="btn">
                                ${twSDK.tt('Send')}
                            </a>
                        </td>
                    </tr>
                `;
        });

        combinationsTable += `</tbody></table>`;

        return combinationsTable;
    }

    // Helper: Build the snipes needed table
    function buildSnipesNeededTable(snipesNeeded) {
        let snipesNeededTable = ``;
        let tableRows = ``;

        if (snipesNeeded === null) {
            tableRows += buildSnipeNeededTableRow(
                game_data.village.coord,
                new Date().toLocaleString('en-GB').replace(',', ''),
                0,
                50
            );
        } else {
            snipesNeeded.forEach((snipeNeeded) => {
                const { coord, landingTime, sigil, minAmount } = snipeNeeded;
                tableRows += buildSnipeNeededTableRow(
                    coord,
                    landingTime,
                    sigil,
                    minAmount
                );
            });
        }

        snipesNeededTable = `
                <table class="ra-table ra-table-v2" width="100%">
                    <thead>
                        <tr>
                            <th width="15%">
                                ${twSDK.tt('Village')}
                            </th>
                            <th width="47%">
                                ${twSDK.tt('Landing Time')}
                            </th>
                            <th width="15%">
                                ${twSDK.tt('Sigil')}
                            </th>
                            <th width="15%">
                                ${twSDK.tt('Min. Amount')}
                            </th>
                            <th width="20%">
                                ${twSDK.tt('Action')}
                            </th>
                        </tr>
                    </thead>
                    <tbody id="raSnipeNeeded">
                        ${tableRows}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5">
                                <a href="javascript:void(0);" class="btn" id="raAddNewSnipeNeededBtn">
                                    ${twSDK.tt('Add new Snipe')}
                                </a>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            `;

        return snipesNeededTable;
    }

    // Helper: Build a table row on the snipes needed table
    function buildSnipeNeededTableRow(
        coord = '',
        landingTime = '',
        sigil = 0,
        minAmount = 50
    ) {
        return `
                <tr>
                    <td>
                        <input type="text" class="ra-input ra-tac" name="village_coord" value="${coord}" />
                    </td>
                    <td>
                        <input type="text" class="ra-input" name="landing_time" value="${landingTime}" />
                    </td>
                    <td>
                        <input type="text" class="ra-input ra-tac" name="sigil" value="${sigil}" />
                    </td>
                    <td>
                        <input type="text" class="ra-input ra-tac" name="min_amount" value="${minAmount}" />
                    </td>
                    <td class="ra-tac">
                        <a href="javascript:void(0);" class="ra-remove-snipe">
                            <img src="/graphic/forum/thread_delete.webp">
                        </a>
                    </td>
                </tr>
            `;
    }

    // Helper: Get BB Code export for snipe attempts
    function getBBCodeExport(snipes) {
        let bbCode = `[table][**]${twSDK.tt('Unit')}[||]${twSDK.tt(
            'From'
        )}[||]${twSDK.tt('To')}[||]${twSDK.tt('Landing Time')}[||]${twSDK.tt(
            'Launch Time'
        )}[||]${twSDK.tt('Command')}[||]${twSDK.tt('Status')}[/**]\n`;

        snipes.forEach((snipe) => {
            const {
                fromCoord,
                toCoord,
                formattedLaunchTime,
                id,
                unit,
                unitAmount,
                landingTime,
            } = snipe;
            const [toX, toY] = toCoord.split('|');

            let commandUrl = '';

            if (game_data.player.sitter > 0) {
                commandUrl = `/game.php?t=${game_data.player.id}&village=${id}&screen=place&x=${toX}&y=${toY}&${unit}=${unitAmount}`;
            } else {
                commandUrl = `/game.php?village=${id}&screen=place&x=${toX}&y=${toY}&${unit}=${unitAmount}`;
            }

            bbCode += `[*][unit]${unit}[/unit] ${twSDK.formatAsNumber(
                unitAmount
            )}[|] ${fromCoord} [|] ${toCoord} [|] ${landingTime} [|]${formattedLaunchTime}[|][url=${
                window.location.origin
            }${commandUrl}]${twSDK.tt('Send')}[/url][|]\n`;
        });

        bbCode += `[/table]`;

        return bbCode;
    }

    // Helper: Add snipe needed table row
    function addTableRow(coord, landingTime, sigil, minAmount) {
        const snipesNeeded = collectSnipesNeeded();
        const doesExist = snipesNeeded.filter((item) => {
            return item.coord === coord && item.landingTime === landingTime;
        });

        if (doesExist && doesExist.length === 0) {
            const tableRow = buildSnipeNeededTableRow(
                coord,
                landingTime,
                sigil,
                minAmount
            );
            jQuery('#raSnipeNeeded').append(tableRow);
            handleRemoveSnipeNeeded();
        } else {
            UI.InfoMessage(twSDK.tt('Already exists!'));
        }
    }

    // Helper: Format a countdown without discarding milliseconds
    function formatDurationMs(milliseconds) {
        const duration = Math.max(0, Math.floor(milliseconds));
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor(duration / 60000) % 60;
        const seconds = Math.floor(duration / 1000) % 60;
        return `${hours}:${twSDK.zeroPad(minutes, 2)}:${twSDK.zeroPad(seconds, 2)}.${twSDK.zeroPad(duration % 1000, 3)}`;
    }

    // Helper: Use the game's synchronized clock when available
    function getCurrentServerTimeMs() {
        if (window.Timing && typeof window.Timing.getCurrentServerTime === 'function') {
            return window.Timing.getCurrentServerTime();
        }
        return twSDK.getServerDateTimeObject().getTime();
    }

    // Helper: Update only the Mass Snipe countdowns
    function startCountdownMs() {
        const container = document.getElementById('raPossibleCombinationsTable');
        clearInterval(jQuery(container).data('massSnipeCountdownInterval'));

        function updateCountdowns() {
            if (!container.isConnected) {
                clearInterval(intervalId);
                return;
            }

            const serverTime = getCurrentServerTimeMs();
            const countdowns = container.querySelectorAll('.ra-countdown-ms');
            let firstRemainingTime = null;

            countdowns.forEach((countdown) => {
                const remaining = Number(countdown.dataset.endtimeMs) - serverTime;
                if (remaining <= 0) {
                    countdown.closest('tr').remove();
                    return;
                }

                countdown.textContent = formatDurationMs(remaining);
                if (firstRemainingTime === null) {
                    firstRemainingTime = countdown.textContent;
                    if (remaining <= 10000 && !countdown.dataset.alertPlayed) {
                        countdown.dataset.alertPlayed = 'true';
                        TribalWars.playSound('chat');
                    }
                }
            });

            document.title = twSDK.tt('Send in') + ' ' +
                (firstRemainingTime ?? formatDurationMs(0));
            if (firstRemainingTime === null) {
                clearInterval(intervalId);
                jQuery(container).removeData('massSnipeCountdownInterval');
            }
        }

        const intervalId = setInterval(updateCountdowns, 25);
        jQuery(container).data('massSnipeCountdownInterval', intervalId);
        updateCountdowns();
    }

    // Helper: Get landing time date object
    function getLandingTime(landingTime) {
        const [landingDay, landingHour] = landingTime.split(' ');
        const [day, month, year] = landingDay.split('/');
        const [hours, minutes, seconds, milliseconds = 0] = landingHour.split(':');
        const landingTimeObject = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hours),
            Number(minutes),
            Number(seconds),
            Number(milliseconds)
        );
        return landingTimeObject;
    }

    // Helper: Get launch time of command
    function getLaunchTime(unit, landingTime, distance, sigil) {
        const msPerSec = 1000;
        const secsPerMin = 60;
        const msPerMin = msPerSec * secsPerMin;
        const sigilRatio = 1 + sigil / 100;

        const unitSpeed = worldUnitInfo.config[unit].speed;
        const unitTime = (distance * unitSpeed * msPerMin) / sigilRatio;

        const launchTime = new Date();
        launchTime.setTime(
            Math.round(landingTime.getTime() - unitTime)
        );

        return launchTime.getTime();
    }

    // Helper: Parse train info from selected text
    function parseTrains(selectedText) {
        try {
            let foundSnipesNeeded = [];
            let villagesToBeSniped = selectedText.split(twSDK.tt('Village:'));

            if (villagesToBeSniped.length > 1) {
                villagesToBeSniped = villagesToBeSniped.filter(
                    (item) => item !== ''
                );

                villagesToBeSniped.forEach((villageToBeSniped) => {
                    const snipeNeeded = [];
                    const destination = villageToBeSniped.match(
                        twSDK.coordsRegex
                    )[0];
                    let linesOfText = villageToBeSniped.split('\n');

                    linesOfText = linesOfText.filter((line) => line !== '');
                    linesOfText = linesOfText.filter((line) => {
                        return (
                            line.includes(twSDK.tt('Noble')) ||
                            line.includes(twSDK.tt('Village:'))
                        );
                    });

                    linesOfText = linesOfText.map((line) => line.trim());

                    if (linesOfText && linesOfText.length) {
                        Object.values(linesOfText).forEach((row) => {
                            if (row.includes(twSDK.tt('Noble'))) {
                                let landingTime = '';
                                landingTime = row
                                    .split(twSDK.tt('Arrival time:'))[1]
                                    .match(twSDK.dateTimeMatch)[0];

                                if (
                                    landingTime !== '' &&
                                    new Date(landingTime).getTime() >
                                        twSDK
                                            .getServerDateTimeObject()
                                            .getTime()
                                ) {
                                    snipeNeeded.push(landingTime);
                                }
                            }
                        });
                    }

                    foundSnipesNeeded.push({
                        destination: destination,
                        snipeNeeded: snipeNeeded,
                    });
                });

                foundSnipesNeeded = foundSnipesNeeded.filter(
                    (item) => item.snipeNeeded.length > 0
                );
            }

            return foundSnipesNeeded;
        } catch (error) {
            UI.ErrorMessage(
                twSDK.tt('There has been an error while parsing the text!')
            );
            console.error(`${scriptInfo} Error: `, error);
        }
    }

    // Helper: Get the default field values on script load time
    function initDefaultValues() {
        const selectedUnits =
            JSON.parse(
                localStorage.getItem(
                    `${scriptConfig.scriptData.prefix}_chosen_units`
                )
            ) ?? DEFAULT_VALUES.SELECTED_UNITS;

        const snipesNeeded =
            JSON.parse(
                sessionStorage.getItem(
                    `${scriptConfig.scriptData.prefix}_snipes_needed`
                )
            ) ?? null;

        return { selectedUnits, snipesNeeded };
    }

    // Helper: Collect user input
    function collectUserInput() {
        const selectedUnits = collectSelectedUnits();
        const snipesNeeded = collectSnipesNeeded();

        return { selectedUnits, snipesNeeded };
    }

    // Helper: Collect selected units
    function collectSelectedUnits() {
        const selectedUnits = [];

        jQuery('.ra-unit-selector').each(function () {
            if (jQuery(this).is(':checked')) {
                selectedUnits.push(this.value);
            }
        });

        return selectedUnits;
    }

    // Helper: Collect snipes needed
    function collectSnipesNeeded() {
        const snipesNeeded = [];

        jQuery('#raSnipeNeeded > tr').each(function () {
            const villageCoord = jQuery(this)
                .find('td input[name="village_coord"]')
                .val();
            const landingTime = jQuery(this)
                .find('td input[name="landing_time"]')
                .val();
            const sigil = jQuery(this).find('td input[name="sigil"]').val();
            const minAmount = jQuery(this)
                .find('td input[name="min_amount"]')
                .val();

            snipesNeeded.push({
                coord: villageCoord,
                landingTime: landingTime,
                sigil: parseInt(sigil),
                minAmount: parseInt(minAmount),
            });
        });

        return snipesNeeded;
    }

    // Helper: Save user input in memory
    function saveUserInput(userInput) {
        const { selectedUnits, snipesNeeded } = userInput;

        if (selectedUnits.length) {
            localStorage.setItem(
                `${scriptConfig.scriptData.prefix}_chosen_units`,
                JSON.stringify(selectedUnits)
            );
        }

        if (snipesNeeded.length) {
            sessionStorage.setItem(
                `${scriptConfig.scriptData.prefix}_snipes_needed`,
                JSON.stringify(snipesNeeded)
            );
        }
    }

    // Helper: Fetch home troop counts for current group
    async function fetchTroopsForCurrentGroup(groupId) {
        const mobileCheck = $('#mobileHeader').length > 0;
        const troopsForGroup = await jQuery
            .get(
                game_data.link_base_pure +
                    `overview_villages&mode=combined&group=${groupId}&page=-1`
            )
            .then(async (response) => {
                const htmlDoc = jQuery.parseHTML(response);
                const homeTroops = [];

                if (mobileCheck) {
                    let table = jQuery(htmlDoc).find(
                        '.overview-container > div'
                    );
                    table.each((i, el) => {
                        const villageId = jQuery(el)
                            .find('.quickedit-vn')
                            .data('id');
                        const troopCounts = {};

                        const unitsElements = jQuery(el).find(
                            '.overview-units-row > div.unit-row-item'
                        );
                        unitsElements.each((j, unitElement) => {
                            const img = jQuery(unitElement).find('img');
                            const span =
                                jQuery(unitElement).find('span.unit-row-name');
                            if (img.length && span.length) {
                                let unitType = img
                                    .attr('src')
                                    .split('unit_')[1]
                                    .replace('@2x.webp', '');
                                let value = parseInt(span.text()) || 0;
                                troopCounts[unitType] = value;
                            }
                        });
                        troopCounts.villageId = villageId;
                        homeTroops.push(troopCounts);
                    });
                } else {
                    const combinedTableRows = jQuery(htmlDoc).find(
                        '#combined_table tr.nowrap'
                    );
                    const combinedTableHead = jQuery(htmlDoc).find(
                        '#combined_table tr:eq(0) th'
                    );

                    const combinedTableHeader = [];

                    // collect possible buildings and troop types
                    jQuery(combinedTableHead).each(function () {
                        const thImage = jQuery(this).find('img').attr('src');
                        if (thImage) {
                            let thImageFilename = thImage.split('/').pop();
                            thImageFilename = thImageFilename.replace(
                                '.webp',
                                ''
                            );
                            combinedTableHeader.push(thImageFilename);
                        } else {
                            combinedTableHeader.push(null);
                        }
                    });

                    // collect possible troop types
                    combinedTableRows.each(function () {
                        let rowTroops = {};

                        combinedTableHeader.forEach((tableHeader, index) => {
                            if (tableHeader) {
                                if (tableHeader.includes('unit_')) {
                                    const villageId = jQuery(this)
                                        .find('td:eq(1) span.quickedit-vn')
                                        .attr('data-id');
                                    const unitType = tableHeader.replace(
                                        'unit_',
                                        ''
                                    );
                                    rowTroops = {
                                        ...rowTroops,
                                        villageId: parseInt(villageId),
                                        [unitType]: parseInt(
                                            jQuery(this)
                                                .find(`td:eq(${index})`)
                                                .text()
                                        ),
                                    };
                                }
                            }
                        });

                        homeTroops.push(rowTroops);
                    });
                }

                return homeTroops;
            })
            .catch((error) => {
                UI.ErrorMessage(
                    tt('An error occured while fetching troop counts!')
                );
                console.error(`${scriptInfo()} Error:`, error);
            });

        return troopsForGroup;
    }

    // Helper: Fetch player villages by group
    async function fetchAllPlayerVillagesByGroup(groupId) {
        try {
            let fetchVillagesUrl = '';
            if (game_data.player.sitter > 0) {
                fetchVillagesUrl =
                    game_data.link_base_pure +
                    `groups&ajax=load_villages_from_group&t=${game_data.player.id}`;
            } else {
                fetchVillagesUrl =
                    game_data.link_base_pure +
                    'groups&ajax=load_villages_from_group';
            }
            const villagesByGroup = await jQuery
                .post({
                    url: fetchVillagesUrl,
                    data: { group_id: groupId },
                    dataType: 'json',
                    headers: { 'TribalWars-Ajax': 1 },
                })
                .then(({ response }) => {
                    const parser = new DOMParser();
                    const htmlDoc = parser.parseFromString(
                        response.html,
                        'text/html'
                    );
                    const tableRows = jQuery(htmlDoc)
                        .find('#group_table > tbody > tr')
                        .not(':eq(0)');

                    if (tableRows.length) {
                        let villagesList = [];

                        tableRows.each(function () {
                            const villageId =
                                jQuery(this)
                                    .find('td:eq(0) a')
                                    .attr('data-village-id') ??
                                jQuery(this)
                                    .find('td:eq(0) a')
                                    .attr('href')
                                    .match(/\d+/)[0];
                            const villageName = jQuery(this)
                                .find('td:eq(0)')
                                .text()
                                .trim();
                            const villageCoords = jQuery(this)
                                .find('td:eq(1)')
                                .text()
                                .trim();

                            villagesList.push({
                                id: parseInt(villageId),
                                name: villageName,
                                coords: villageCoords,
                            });
                        });

                        return villagesList;
                    } else {
                        return [];
                    }
                });

            return villagesByGroup;
        } catch (error) {
            UI.ErrorMessage(
                twSDK.tt('There was an error fetching villages by group!')
            );
            console.error(`${scriptInfo} Error:`, error);
        }
    }

    // Service: Fetch world config and needed data
    async function fetchWorldConfigData() {
        try {
            const worldUnitInfo = await twSDK.getWorldUnitInfo();
            const villages = await twSDK.worldDataAPI('village');
            return { villages, worldUnitInfo };
        } catch (error) {
            UI.ErrorMessage(
                twSDK.tt('There was an error while fetching the data!')
            );
            console.error(`${scriptInfo} Error:`, error);
        }
    }
})();
