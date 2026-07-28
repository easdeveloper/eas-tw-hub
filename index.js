(() => {
    'use strict';

    const existingPanel = document.getElementById('eas-tw-hub');

    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    const panel = document.createElement('div');

    panel.id = 'eas-tw-hub';

    panel.style.cssText = `
        position: fixed;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        width: 420px;
        padding: 20px;
        background: #f4e4bc;
        border: 3px solid #6b3d0b;
        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.7);
        color: #241608;
        font-family: Verdana, Arial, sans-serif;
    `;

    panel.innerHTML = `
        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
        ">
            <strong style="font-size:20px">
                ⚔️ EAS TW Hub
            </strong>

            <button id="eas-tw-close">
                X
            </button>
        </div>

        <hr>

        <p>
            O carregamento externo funcionou corretamente!
        </p>

        <p>
            Versão: 0.1.0
        </p>

        <button id="eas-tw-test">
            Testar sistema
        </button>
    `;

    document.body.appendChild(panel);

    document
        .getElementById('eas-tw-close')
        .addEventListener('click', () => panel.remove());

    document
        .getElementById('eas-tw-test')
        .addEventListener('click', () => {
            alert('EAS TW Hub funcionando! 🔥');
        });
})();