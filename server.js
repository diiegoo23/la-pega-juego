const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let partidas = {};
let jugadoresPartidas = {};

function generarCodigo() {
    let codigo;
    do {
        codigo = Math.floor(1000 + Math.random() * 9000).toString();
    } while (partidas[codigo]);
    return codigo;
}

function crearBaraja() {
    const baraja = [];
    const palos = ['oros', 'copas', 'espadas', 'bastos'];
    for (let palo of palos) {
        for (let valor = 1; valor <= 12; valor++) {
            if (valor === 8 || valor === 9) continue;
            let tipo = 'numerica';
            if (valor === 10) tipo = 'sota';
            if (valor === 11) tipo = 'caballo';
            if (valor === 12) tipo = 'rey';
            baraja.push({ valor, tipo, palo });
        }
    }
    return baraja;
}

function calcularPegada(carta, mesa) {
    const recogidas = [];
    let valorActual = carta.valor;
    let cartasDisponibles = [...mesa];

    for (let i = 0; i < 12; i++) {
        const idxCartaEnMesa = cartasDisponibles.findIndex(c => c.valor === valorActual);
        if (idxCartaEnMesa !== -1) {
            const cartaEnMesa = cartasDisponibles[idxCartaEnMesa];
            recogidas.push(cartaEnMesa);
            cartasDisponibles.splice(idxCartaEnMesa, 1);

            if (valorActual === 7) {
                valorActual = 10;
            } else if (valorActual === 12) {
                valorActual = 1;
            } else {
                valorActual++;
            }
        } else {
            break;
        }
    }
    return recogidas;
}

function notificarTurno(codigo) {
    const partida = partidas[codigo];
    if (!partida) return;
    const idJugador = partida.jugadores[partida.turno];

    if (idJugador === 'bot') {
        jugarTurnoBot(codigo);
    } else {
        io.to(idJugador).emit('tu-turno');
    }
}

function iniciarReparto(codigo) {
    const partida = partidas[codigo];
    if (!partida) return;

    const numJugadores = partida.jugadores.length;
    const dealerIndex = (partida.primerJugadorRonda - 1 + numJugadores) % numJugadores;
    const dealerId = partida.jugadores[dealerIndex];

    if (dealerId === 'bot') {
        setTimeout(() => {
            io.to(codigo).emit('chat-mensaje', { emisor: '🤖 Sistema', mensaje: 'La Máquina reparte y elige contar por 1. Repartiendo...' });
            repartirCartas(codigo);
        }, 1500);
    } else {
        io.to(codigo).emit('chat-mensaje', { emisor: '🤖 Sistema', mensaje: `Esperando a que ${partida.nombres[dealerId]} decida por dónde contar...` });
        io.to(dealerId).emit('pedir-corte');
    }
}

function repartirCartas(codigo) {
    const partida = partidas[codigo];
    if (!partida.baraja || partida.baraja.length === 0) {
        partida.baraja = crearBaraja().sort(() => Math.random() - 0.5);
    }

    partida.manos = {};
    partida.jugadores.forEach(id => {
        partida.manos[id] = partida.baraja.splice(0, 3);
    });

    partida.jugadores.forEach(id => {
        if (id !== 'bot') io.to(id).emit('recibir-mano', partida.manos[id]);
    });

    io.to(codigo).emit('mesa-actualizada', partida.mesa);
    io.to(codigo).emit('puntajes-actualizados', partida.puntos);
    io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);

    notificarTurno(codigo);
}

function verificarFinPartida(partida, codigo) {
    if (partida.puntos.rojo >= 40 || partida.puntos.azul >= 40) {
        const ganador = partida.puntos.rojo >= 40 ? 'rojo' : 'azul';
        io.to(codigo).emit('partida-terminada', {
            ganador,
            puntos: partida.puntos,
            cartasRecogidas: partida.cartasRecogidas
        });
        return true;
    }
    return false;
}

function arrancarJuego(codigo) {
    const partida = partidas[codigo];
    partida.mesa = partida.baraja.splice(0, 4);
    partida.primerJugadorRonda = 0;
    partida.turno = partida.primerJugadorRonda;

    partida.jugadores.forEach(id => {
        if (id !== 'bot') {
            io.to(id).emit('mesa-inicial', partida.mesa);
            io.to(id).emit('iniciar-juego');
        }
    });
    
    iniciarReparto(codigo);
}

function jugarTurnoBot(codigo) {
    const partida = partidas[codigo];
    if (!partida) return;

    setTimeout(() => {
        const p = partidas[codigo]; 
        if (!p || p.jugadores[p.turno] !== 'bot') return;

        const mano = p.manos['bot'];
        if (!mano || mano.length === 0) return;

        let indiceElegido = -1;

        if (p.cadenaPega) {
            indiceElegido = mano.findIndex(c => c.valor === p.cadenaPega.valor);
        } else if (p.ultimaCartaTirada) {
            indiceElegido = mano.findIndex(c => c.valor === p.ultimaCartaTirada.valor);
        }

        if (indiceElegido === -1 && p.mesa.length > 0) {
            for (let i = 0; i < mano.length; i++) {
                if (p.mesa.some(m => m.valor === mano[i].valor)) {
                    indiceElegido = i;
                    break;
                }
            }
        }

        if (indiceElegido === -1) {
            let minValor = 99;
            for (let i = 0; i < mano.length; i++) {
                if (mano[i].valor < minValor) {
                    minValor = mano[i].valor;
                    indiceElegido = i;
                }
            }
        }

        procesarTiro(codigo, 'bot', indiceElegido);
    }, 1500);
}

function procesarTiro(codigo, idJugador, indice) {
    const partida = partidas[codigo];
    if (!partida || idJugador !== partida.jugadores[partida.turno]) return;

    const manoJugador = partida.manos[idJugador];
    if (manoJugador && indice >= 0 && indice < manoJugador.length) {
        const cartaTirada = { ...manoJugador[indice] };
        manoJugador.splice(indice, 1);

        if (partida.cadenaPega && cartaTirada.valor === partida.cadenaPega.valor) {
            const victima = partida.cadenaPega.victima;
            const acumuladas = partida.cadenaPega.cartasAcumuladas;

            if (partida.cartasRecogidas[victima] !== undefined) {
                partida.cartasRecogidas[victima] = Math.max(0, partida.cartasRecogidas[victima] - acumuladas);
            }

            const nuevasAcumuladas = acumuladas + 1;
            partida.cartasRecogidas[idJugador] += nuevasAcumuladas;

            partida.cadenaPega = { valor: cartaTirada.valor, cartasAcumuladas: nuevasAcumuladas, victima: idJugador };
            partida.ultimoEnRecoger = idJugador;

            io.to(codigo).emit('robo-pega', { ladron: idJugador, valor: cartaTirada.valor, ganadas: nuevasAcumuladas, perdidas: acumuladas });
        }
        else {
            const recogidas = calcularPegada(cartaTirada, partida.mesa);

            if (recogidas.length > 0) {
                partida.mesa = partida.mesa.filter(c => !recogidas.includes(c));
                partida.cartasRecogidas[idJugador] += recogidas.length + 1;
                partida.ultimoEnRecoger = idJugador;

                if (partida.ultimaCartaTirada && cartaTirada.valor === partida.ultimaCartaTirada.valor) {
                    partida.cadenaPega = { valor: cartaTirada.valor, cartasAcumuladas: 2, victima: idJugador };
                } else {
                    partida.cadenaPega = null;
                }

                partida.ultimaCartaTirada = null;
                io.to(codigo).emit('cartas-recogidas', { jugador: idJugador, cartas: recogidas });
            } else {
                partida.mesa.push(cartaTirada);
                partida.ultimaCartaTirada = { valor: cartaTirada.valor, jugador: idJugador };
                partida.cadenaPega = null;
            }
        }

        io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);

        const todasManosVacias = Object.values(partida.manos).every(mano => mano.length === 0);

        if (todasManosVacias) {
            if (partida.baraja.length > 0) {
                partida.ronda++;
                partida.turno = (partida.turno + 1) % partida.jugadores.length;
                
                // ¡CORREGIDO AQUÍ! Ahora solo reparte directamente, no pide el corte de nuevo.
                setTimeout(() => { repartirCartas(codigo); }, 1000);
                
            } else {
                // FIN DE LA RONDA DE 40 CARTAS
                if (partida.ultimoEnRecoger && partida.mesa.length > 0) {
                    partida.cartasRecogidas[partida.ultimoEnRecoger] += partida.mesa.length;
                    partida.mesa = [];
                }

                let cartasRojo = 0;
                let cartasAzul = 0;
                partida.equipoRojo.forEach(id => cartasRojo += (partida.cartasRecogidas[id] || 0));
                partida.equipoAzul.forEach(id => cartasAzul += (partida.cartasRecogidas[id] || 0));

                io.to(codigo).emit('mesa-actualizada', partida.mesa);
                io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);
                io.to(codigo).emit('fin-de-ronda', { cartasRojo, cartasAzul });
            }
        } else {
            partida.turno = (partida.turno + 1) % partida.jugadores.length;
            notificarTurno(codigo);
        }

        partida.jugadores.forEach(id => {
            if (id !== 'bot' && partida.manos[id]) io.to(id).emit('mano-actualizada', partida.manos[id]);
        });
        io.to(codigo).emit('mesa-actualizada', partida.mesa);
        verificarFinPartida(partida, codigo);
    }
}


io.on('connection', socket => {
    socket.on('crear-partida', ({ maxJugadores, nombre }) => {
        const codigo = generarCodigo();
        partidas[codigo] = { 
            jugadores: [socket.id], 
            nombres: { [socket.id]: nombre || 'Jugador 1' }, 
            maxJugadores, 
            puntos: { rojo: 0, azul: 0 }, 
            manos: {}, 
            mesa: [], 
            turno: 0, 
            baraja: crearBaraja().sort(() => Math.random() - 0.5), 
            equipoRojo: [], 
            equipoAzul: [], 
            cartasRecogidas: {}, 
            ronda: 0, 
            primerJugadorRonda: 0, 
            ultimoEnRecoger: null, 
            equiposSeleccion: { rojo: [], azul: [] }, 
            ultimaCartaTirada: null, 
            cadenaPega: null 
        };
        partidas[codigo].cartasRecogidas[socket.id] = 0;
        jugadoresPartidas[socket.id] = codigo;
        socket.join(codigo);
        socket.emit('partida-creada', { codigo });
    });

    socket.on('crear-partida-bot', ({ nombre }) => {
        const codigo = generarCodigo();
        partidas[codigo] = { 
            jugadores: [socket.id, 'bot'], 
            nombres: { [socket.id]: nombre || 'Jugador', 'bot': '🤖 La Máquina' }, 
            maxJugadores: 2, 
            puntos: { rojo: 0, azul: 0 }, 
            manos: {}, 
            mesa: [], 
            turno: 0, 
            baraja: crearBaraja().sort(() => Math.random() - 0.5), 
            equipoRojo: [socket.id], 
            equipoAzul: ['bot'], 
            cartasRecogidas: { [socket.id]: 0, 'bot': 0 }, 
            ronda: 0, 
            primerJugadorRonda: 0, 
            ultimoEnRecoger: null, 
            equiposSeleccion: { rojo: [], azul: [] }, 
            ultimaCartaTirada: null, 
            cadenaPega: null 
        };
        jugadoresPartidas[socket.id] = codigo;
        socket.join(codigo);
        socket.emit('partida-creada', { codigo });
        arrancarJuego(codigo);
    });

    socket.on('unirse-partida', ({ codigo, nombre }) => {
        codigo = String(codigo).trim();
        const partida = partidas[codigo];

        if (!partida) return socket.emit('error-unirse', 'Código incorrecto');
        if (partida.jugadores.includes(socket.id)) return socket.emit('error-unirse', 'Ya estás dentro de esta partida.');
        if (partida.jugadores.length >= partida.maxJugadores) return socket.emit('error-unirse', 'Partida llena');

        partida.jugadores.push(socket.id);
        partida.nombres[socket.id] = nombre || `Jugador ${partida.jugadores.length}`;
        jugadoresPartidas[socket.id] = codigo;
        socket.join(codigo);
        partida.cartasRecogidas[socket.id] = 0;

        io.to(codigo).emit('actualizar-jugadores', { jugadores: partida.jugadores, nombres: partida.nombres });

        if (partida.jugadores.length === partida.maxJugadores) {
            if (partida.maxJugadores === 4) {
                partida.jugadores.forEach(idJugador => {
                    io.to(idJugador).emit('mostrar-seleccion-equipos');
                    io.to(idJugador).emit('equipos-actualizados', { rojo: partida.equiposSeleccion.rojo, azul: partida.equiposSeleccion.azul, nombres: partida.nombres });
                });
            } else {
                partida.equipoRojo = [partida.jugadores[0]];
                partida.equipoAzul = [partida.jugadores[1]];
                arrancarJuego(codigo);
            }
        }
    });

    socket.on('elegir-equipo', ({ codigo, equipo }) => {
        const partida = partidas[codigo];
        if (!partida) return;

        partida.equiposSeleccion.rojo = partida.equiposSeleccion.rojo.filter(id => id !== socket.id);
        partida.equiposSeleccion.azul = partida.equiposSeleccion.azul.filter(id => id !== socket.id);

        if (partida.equiposSeleccion[equipo].length < 2) partida.equiposSeleccion[equipo].push(socket.id);

        io.to(codigo).emit('equipos-actualizados', { rojo: partida.equiposSeleccion.rojo, azul: partida.equiposSeleccion.azul, nombres: partida.nombres });

        if (partida.equiposSeleccion.rojo.length === 2 && partida.equiposSeleccion.azul.length === 2) {
            partida.equipoRojo = [...partida.equiposSeleccion.rojo];
            partida.equipoAzul = [...partida.equiposSeleccion.azul];
            partida.jugadores = [partida.equipoRojo[0], partida.equipoAzul[0], partida.equipoRojo[1], partida.equipoAzul[1]];
            arrancarJuego(codigo);
        }
    });

    socket.on('corte-elegido', ({ codigo, eleccion }) => {
        const partida = partidas[codigo];
        if (partida) {
            io.to(codigo).emit('chat-mensaje', { emisor: '🤖 Sistema', mensaje: `${partida.nombres[socket.id]} decidió contar por ${eleccion}. ¡Repartiendo cartas!` });
            repartirCartas(codigo);
        }
    });

    socket.on('cantar-ronda', codigo => {
        const partida = partidas[codigo];
        if (partida) {
            io.to(codigo).emit('chat-mensaje', { emisor: '📢 ALERTA', mensaje: `¡${partida.nombres[socket.id]} HA CANTADO RONDA!` });
            io.to(codigo).emit('jugador-canto-ronda', partida.nombres[socket.id]);
        }
    });

    socket.on('chat-mensaje', ({ codigo, mensaje }) => {
        const partida = partidas[codigo];
        if (partida) {
            io.to(codigo).emit('chat-mensaje', { emisor: partida.nombres[socket.id], mensaje });
        }
    });

    socket.on('tirar-carta', ({ carta, indice }) => {
        const codigo = jugadoresPartidas[socket.id];
        procesarTiro(codigo, socket.id, indice);
    });

    socket.on('siguiente-ronda', codigo => {
        const partida = partidas[codigo];
        if (!partida || partida.baraja.length > 0) return;

        partida.baraja = crearBaraja().sort(() => Math.random() - 0.5);
        partida.mesa = partida.baraja.splice(0, 4);

        partida.ultimoEnRecoger = null;
        partida.ultimaCartaTirada = null;
        partida.cadenaPega = null;

        for (let id in partida.cartasRecogidas) { 
            partida.cartasRecogidas[id] = 0; 
        }

        partida.primerJugadorRonda = (partida.primerJugadorRonda + 1) % partida.jugadores.length;
        partida.turno = partida.primerJugadorRonda;

        io.to(codigo).emit('nueva-ronda-iniciada');
        
        partida.jugadores.forEach(id => {
            if (id !== 'bot') io.to(id).emit('mesa-inicial', partida.mesa);
        });
        
        // ¡Aquí es donde volvemos a pedir el corte para la nueva baraja!
        iniciarReparto(codigo);
    });

    socket.on('sumar-punto', ({ codigo, equipo }) => {
        const partida = partidas[codigo];
        if (partida) {
            partida.puntos[equipo]++;
            io.to(codigo).emit('puntajes-actualizados', partida.puntos);
            verificarFinPartida(partida, codigo);
        }
    });

    socket.on('restar-punto', ({ codigo, equipo }) => {
        const partida = partidas[codigo];
        if (partida && partida.puntos[equipo] > 0) {
            partida.puntos[equipo]--;
            io.to(codigo).emit('puntajes-actualizados', partida.puntos);
        }
    });

    socket.on('disconnect', () => {
        const codigo = jugadoresPartidas[socket.id];
        if (codigo && partidas[codigo]) {
            const partida = partidas[codigo];
            const idx = partida.jugadores.indexOf(socket.id);
            if (idx !== -1) {
                partida.jugadores.splice(idx, 1);
                delete partida.cartasRecogidas[socket.id];
                delete partida.nombres[socket.id];

                partida.equiposSeleccion.rojo = partida.equiposSeleccion.rojo.filter(id => id !== socket.id);
                partida.equiposSeleccion.azul = partida.equiposSeleccion.azul.filter(id => id !== socket.id);

                if (partida.turno >= idx) partida.turno = Math.max(0, partida.turno - 1);

                io.to(codigo).emit('actualizar-jugadores', { jugadores: partida.jugadores, nombres: partida.nombres });
                io.to(codigo).emit('equipos-actualizados', { rojo: partida.equiposSeleccion.rojo, azul: partida.equiposSeleccion.azul, nombres: partida.nombres });
                io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);
                
                const humanos = partida.jugadores.filter(id => id !== 'bot');
                if (humanos.length === 0) delete partidas[codigo];
            }
        }
        delete jugadoresPartidas[socket.id];
    });
});

http.listen(3000, () => console.log('Servidor escuchando en http://localhost:3000'));