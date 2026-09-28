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
        io.to(id).emit('recibir-mano', partida.manos[id]);
    });

    io.to(codigo).emit('mesa-actualizada', partida.mesa);
    io.to(codigo).emit('puntajes-actualizados', partida.puntos);
    io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);

    const jugadorTurno = partida.jugadores[partida.turno];
    io.to(jugadorTurno).emit('tu-turno');
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

    repartirCartas(codigo);

    partida.jugadores.forEach(id => {
        io.to(id).emit('mesa-inicial', partida.mesa);
        io.to(id).emit('iniciar-juego');
    });
}

io.on('connection', socket => {
    // NUEVO: Recibe el nombre
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

    // NUEVO: Recibe el nombre al unirse
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

        // Enviamos la lista de jugadores Y sus nombres
        io.to(codigo).emit('actualizar-jugadores', {
            jugadores: partida.jugadores,
            nombres: partida.nombres
        });

        if (partida.jugadores.length === partida.maxJugadores) {
            if (partida.maxJugadores === 4) {
                partida.jugadores.forEach(idJugador => {
                    io.to(idJugador).emit('mostrar-seleccion-equipos');
                    io.to(idJugador).emit('equipos-actualizados', {
                        rojo: partida.equiposSeleccion.rojo,
                        azul: partida.equiposSeleccion.azul,
                        nombres: partida.nombres
                    });
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

        if (partida.equiposSeleccion[equipo].length < 2) {
            partida.equiposSeleccion[equipo].push(socket.id);
        }

        io.to(codigo).emit('equipos-actualizados', {
            rojo: partida.equiposSeleccion.rojo,
            azul: partida.equiposSeleccion.azul,
            nombres: partida.nombres
        });

        if (partida.equiposSeleccion.rojo.length === 2 && partida.equiposSeleccion.azul.length === 2) {
            partida.equipoRojo = [...partida.equiposSeleccion.rojo];
            partida.equipoAzul = [...partida.equiposSeleccion.azul];
            partida.jugadores = [
                partida.equipoRojo[0], partida.equipoAzul[0],
                partida.equipoRojo[1], partida.equipoAzul[1]
            ];
            arrancarJuego(codigo);
        }
    });

    socket.on('tirar-carta', ({ carta, indice }) => {
        const codigo = jugadoresPartidas[socket.id];
        const partida = partidas[codigo];
        if (!partida || socket.id !== partida.jugadores[partida.turno]) return;

        const manoJugador = partida.manos[socket.id];
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
                partida.cartasRecogidas[socket.id] += nuevasAcumuladas;

                partida.cadenaPega = {
                    valor: cartaTirada.valor,
                    cartasAcumuladas: nuevasAcumuladas,
                    victima: socket.id
                };
                partida.ultimoEnRecoger = socket.id;

                io.to(codigo).emit('robo-pega', {
                    ladron: socket.id,
                    valor: cartaTirada.valor,
                    ganadas: nuevasAcumuladas,
                    perdidas: acumuladas
                });
            }
            else {
                const recogidas = calcularPegada(cartaTirada, partida.mesa);

                if (recogidas.length > 0) {
                    partida.mesa = partida.mesa.filter(c => !recogidas.includes(c));
                    partida.cartasRecogidas[socket.id] += recogidas.length + 1;
                    partida.ultimoEnRecoger = socket.id;

                    if (partida.ultimaCartaTirada && cartaTirada.valor === partida.ultimaCartaTirada.valor) {
                        partida.cadenaPega = {
                            valor: cartaTirada.valor,
                            cartasAcumuladas: 2,
                            victima: socket.id
                        };
                    } else {
                        partida.cadenaPega = null;
                    }

                    partida.ultimaCartaTirada = null;
                    io.to(codigo).emit('cartas-recogidas', { jugador: socket.id, cartas: recogidas });
                } else {
                    partida.mesa.push(cartaTirada);
                    partida.ultimaCartaTirada = { valor: cartaTirada.valor, jugador: socket.id };
                    partida.cadenaPega = null;
                }
            }

            io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);

            const todasManosVacias = Object.values(partida.manos).every(mano => mano.length === 0);

            if (todasManosVacias) {
                if (partida.baraja.length > 0) {
                    partida.ronda++;
                    setTimeout(() => { repartirCartas(codigo); }, 1000);

                    partida.turno = (partida.turno + 1) % partida.jugadores.length;
                    io.to(partida.jugadores[partida.turno]).emit('tu-turno');
                } else {
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
                io.to(partida.jugadores[partida.turno]).emit('tu-turno');
            }

            partida.jugadores.forEach(id => {
                if (partida.manos[id]) io.to(id).emit('mano-actualizada', partida.manos[id]);
            });
            io.to(codigo).emit('mesa-actualizada', partida.mesa);
            verificarFinPartida(partida, codigo);
        }
    });

    socket.on('siguiente-ronda', codigo => {
        const partida = partidas[codigo];
        if (!partida) return;
        if (partida.baraja.length > 0) return;

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
        repartirCartas(codigo);
        io.to(codigo).emit('mesa-inicial', partida.mesa);
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

                io.to(codigo).emit('actualizar-jugadores', {
                    jugadores: partida.jugadores,
                    nombres: partida.nombres
                });
                io.to(codigo).emit('equipos-actualizados', {
                    rojo: partida.equiposSeleccion.rojo,
                    azul: partida.equiposSeleccion.azul,
                    nombres: partida.nombres
                });
                io.to(codigo).emit('cartas-recogidas-jugador', partida.cartasRecogidas);
                if (partida.jugadores.length === 0) delete partidas[codigo];
            }
        }
        delete jugadoresPartidas[socket.id];
    });
});

http.listen(3000, () => console.log('Servidor escuchando en http://localhost:3000'));