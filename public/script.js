const socket = io();

const menuDiv = document.getElementById('menu');
const inputNombre = document.getElementById('inputNombre');
const crearDiv = document.getElementById('crearPartida');
const unirseDiv = document.getElementById('unirsePartida');
const codigoDiv = document.getElementById('codigoPartida');
const codigoSpan = document.getElementById('codigo');
const seleccionDiv = document.getElementById('seleccion-equipos');
const juegoDiv = document.getElementById('juego');
const manoDiv = document.getElementById('mano');
const mesaDiv = document.getElementById('mesa');

const btnJugarBot = document.getElementById('jugarBot');
const rojoBtn = document.getElementById('rojo-btn');
const azulBtn = document.getElementById('azul-btn');
const rojoMas = document.getElementById('rojo-mas');
const rojoMenos = document.getElementById('rojo-menos');
const azulMas = document.getElementById('azul-mas');
const azulMenos = document.getElementById('azul-menos');

const inputCodigo = document.getElementById('inputCodigo');
const botonUnirse = document.getElementById('botonUnirse');
const volverCrear = document.getElementById('volverCrear');
const volverUnirse = document.getElementById('volverUnirse');

const btnRonda = document.getElementById('btn-ronda');
const chatMensajes = document.getElementById('chat-mensajes');
const chatInput = document.getElementById('chat-input');
const chatEnviar = document.getElementById('chat-enviar');
const modalCorte = document.getElementById('modal-corte');
const btnCorte1 = document.getElementById('btn-corte-1');
const btnCorte4 = document.getElementById('btn-corte-4');

// Botones de reglas
const btnVerReglas = document.getElementById('verReglas');
const modalReglas = document.getElementById('modalReglas');
const btnCerrarReglas = document.getElementById('cerrarReglas');

// Elementos Modal Fin de Ronda
const finRondaModal = document.getElementById('fin-ronda-modal');
const cartasRojoSpan = document.getElementById('cartas-ronda-rojo');
const cartasAzulSpan = document.getElementById('cartas-ronda-azul');
const btnSiguienteRonda = document.getElementById('btn-siguiente-ronda');

let miTurno = false;
let miCodigo = null;
let miNombre = '';
let marcador = { rojo: 0, azul: 0 };
let partidaActual = null;
let cartasRecogidas = {};

// Reglas
btnVerReglas.onclick = () => { modalReglas.style.display = 'flex'; };
btnCerrarReglas.onclick = () => { modalReglas.style.display = 'none'; };

btnJugarBot.onclick = () => {
    miNombre = inputNombre.value.trim() || 'Jugador';
    socket.emit('crear-partida-bot', { nombre: miNombre });
    menuDiv.style.display = 'none';
};

document.getElementById('crear').onclick = () => {
    miNombre = inputNombre.value.trim() || 'Jugador';
    menuDiv.style.display = 'none';
    crearDiv.style.display = 'block';
};

document.getElementById('unirse').onclick = () => {
    miNombre = inputNombre.value.trim() || 'Jugador';
    menuDiv.style.display = 'none';
    unirseDiv.style.display = 'block';
};

volverCrear.onclick = () => {
    crearDiv.style.display = 'none';
    menuDiv.style.display = 'block';
};

volverUnirse.onclick = () => {
    unirseDiv.style.display = 'none';
    menuDiv.style.display = 'block';
};

document.querySelectorAll('.num-jugadores').forEach(btn => {
    btn.onclick = () => {
        const maxJugadores = parseInt(btn.dataset.num);
        socket.emit('crear-partida', { maxJugadores, nombre: miNombre });
        crearDiv.style.display = 'none';
    };
});

socket.on('partida-creada', ({ codigo }) => {
    miCodigo = codigo;
    codigoSpan.innerText = codigo;
    codigoDiv.style.display = 'block';
});

botonUnirse.onclick = () => {
    const codigo = inputCodigo.value.trim();
    if (!codigo) return alert('Introduce un código válido');
    miCodigo = codigo;
    socket.emit('unirse-partida', { codigo, nombre: miNombre });
};

socket.on('actualizar-jugadores', data => {
    partidaActual = data;
});

socket.on('error-unirse', msg => {
    alert(msg);
    menuDiv.style.display = 'block';
    unirseDiv.style.display = 'none';
});

socket.on('mostrar-seleccion-equipos', () => {
    menuDiv.style.display = 'none';
    crearDiv.style.display = 'none';
    unirseDiv.style.display = 'none';
    codigoDiv.style.display = 'none';
    seleccionDiv.style.display = 'block';
});

document.getElementById('btn-rojo').onclick = () => {
    socket.emit('elegir-equipo', { codigo: miCodigo, equipo: 'rojo' });
};

document.getElementById('btn-azul').onclick = () => {
    socket.emit('elegir-equipo', { codigo: miCodigo, equipo: 'azul' });
};

socket.on('equipos-actualizados', data => {
    const listaRojo = document.getElementById('lista-rojo');
    const listaAzul = document.getElementById('lista-azul');
    listaRojo.innerHTML = data.rojo.map(id => `<li>${id === socket.id ? '⭐ ' : ''}${data.nombres[id]}</li>`).join('');
    listaAzul.innerHTML = data.azul.map(id => `<li>${id === socket.id ? '⭐ ' : ''}${data.nombres[id]}</li>`).join('');
});

socket.on('iniciar-juego', () => {
    seleccionDiv.style.display = 'none';
    codigoDiv.style.display = 'none';
    juegoDiv.style.display = 'block';
});

socket.on('pedir-corte', () => {
    modalCorte.style.display = 'flex';
});

btnCorte1.onclick = () => {
    modalCorte.style.display = 'none';
    socket.emit('corte-elegido', { codigo: miCodigo, eleccion: 1 });
};

btnCorte4.onclick = () => {
    modalCorte.style.display = 'none';
    socket.emit('corte-elegido', { codigo: miCodigo, eleccion: 4 });
};

chatEnviar.onclick = () => {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('chat-mensaje', { codigo: miCodigo, mensaje: msg });
        chatInput.value = '';
    }
};

chatInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') chatEnviar.onclick();
});

socket.on('chat-mensaje', ({ emisor, mensaje }) => {
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '5px';
    msgDiv.style.fontSize = '14px';
    msgDiv.innerHTML = `<strong>${emisor}:</strong> ${mensaje}`;
    chatMensajes.appendChild(msgDiv);
    chatMensajes.scrollTop = chatMensajes.scrollHeight;
});

btnRonda.onclick = () => {
    socket.emit('cantar-ronda', miCodigo);
};

socket.on('jugador-canto-ronda', nombre => {
    alert(`📢 ¡ATENCIÓN! ¡${nombre.toUpperCase()} TIENE RONDA! 📢`);
});

socket.on('recibir-mano', actualizarMano);
socket.on('mano-actualizada', actualizarMano);
socket.on('mesa-inicial', actualizarMesa);
socket.on('mesa-actualizada', actualizarMesa);

socket.on('tu-turno', () => {
    miTurno = true;
    const indicadorTurno = document.getElementById('turno-indicador');
    if (indicadorTurno) {
        indicadorTurno.textContent = '¡Es tu turno!';
        indicadorTurno.style.display = 'block';
        setTimeout(() => { indicadorTurno.style.display = 'none'; }, 3000);
    }
});

socket.on('robo-pega', ({ ladron, valor, ganadas, perdidas }) => {
    let mensaje = '';
    if (ladron === socket.id) {
        mensaje = `🔥 ¡TÚ HAS ROBADO LA PEGA DE ${valor}! 🔥\nTe llevas ${ganadas} cartas y el rival pierde las ${perdidas} que tenía.`;
    } else if (ladron === 'bot') {
        mensaje = `🤖 ¡LA MÁQUINA TE HA ROBADO LA PEGA DE ${valor}! 🤖\nSe lleva ${ganadas} cartas y tú pierdes ${perdidas}.`;
    } else {
        mensaje = `🔥 ¡${partidaActual.nombres[ladron].toUpperCase()} HA ROBADO LA PEGA DE ${valor}! 🔥\nSe lleva ${ganadas} cartas y el rival pierde ${perdidas}.`;
    }
    alert(mensaje);
});

function actualizarMano(mano) {
    manoDiv.innerHTML = '';
    if (mano && mano.length > 0) {
        mano.forEach((carta, i) => {
            const btn = document.createElement('button');
            btn.className = 'carta';
            btn.innerHTML = `<img src="imagenes/${carta.valor}-${carta.palo}.png" alt="${carta.valor} de ${carta.palo}">`;
            btn.onclick = () => {
                if (!miTurno) return alert('No es tu turno');
                socket.emit('tirar-carta', { carta, indice: i });
                miTurno = false;
            };
            manoDiv.appendChild(btn);
        });
    } else {
        manoDiv.innerHTML = '<p>No tienes cartas</p>';
    }
}

function actualizarMesa(mesa) {
    mesaDiv.innerHTML = '';
    if (mesa && mesa.length > 0) {
        mesa.forEach(carta => {
            const div = document.createElement('div');
            div.className = 'carta mesa-carta';
            div.innerHTML = `<img src="imagenes/${carta.valor}-${carta.palo}.png" alt="${carta.valor} de ${carta.palo}">`;
            mesaDiv.appendChild(div);
        });
    } else {
        mesaDiv.innerHTML = '<p>Mesa vacía</p>';
    }
}

// LOGICA FIN DE RONDA Y MARCADOR
socket.on('fin-de-ronda', (data) => {
    cartasRojoSpan.innerText = data.cartasRojo;
    cartasAzulSpan.innerText = data.cartasAzul;
    finRondaModal.style.display = 'flex'; // ¡Ahora se mostrará como un pop-up que ocupa todo!
});

btnSiguienteRonda.onclick = () => {
    socket.emit('siguiente-ronda', miCodigo);
};

socket.on('nueva-ronda-iniciada', () => {
    finRondaModal.style.display = 'none';
});

if (rojoMas) rojoMas.onclick = () => { socket.emit('sumar-punto', { codigo: miCodigo, equipo: 'rojo' }); };
if (rojoMenos) rojoMenos.onclick = () => { socket.emit('restar-punto', { codigo: miCodigo, equipo: 'rojo' }); };
if (azulMas) azulMas.onclick = () => { socket.emit('sumar-punto', { codigo: miCodigo, equipo: 'azul' }); };
if (azulMenos) azulMenos.onclick = () => { socket.emit('restar-punto', { codigo: miCodigo, equipo: 'azul' }); };

socket.on('puntajes-actualizados', data => {
    marcador = data;
    if (rojoBtn) rojoBtn.innerText = marcador.rojo;
    if (azulBtn) azulBtn.innerText = marcador.azul;
});