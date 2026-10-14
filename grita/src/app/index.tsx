import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

const PALABRA = 'GRITÁ';

const POEMA = [
  'NO DIJE LO QUE DEBÍA DECIR',
  'ME TRAGUÉ EL NOMBRE DE LO QUE DUELE',
  'EL SILENCIO PESA MÁS QUE EL GRITO',
  'CALLAR TAMBIÉN ES UNA FORMA DE HERIDA',
  'HOY MI VOZ ROMPE LA TACHADURA',
  'DECIRLO EN VOZ ALTA ES VOLVER A EXISTIR',
];

const UMBRAL_GRITO = 0.45;
const UMBRAL_SILENCIO = 0.15;

function mezclar(lista: string[]) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Piezas animadas (cada elemento de la pantalla es una pieza) ----------

type PiezaAnim = {
  x: Animated.Value;
  y: Animated.Value;
  giro: Animated.Value;
  escala: Animated.Value;
  amp: number; // cuánto se desordena (1 = máximo)
  esc: number; // cuánto crece al gritar
};

function crearPieza(amp: number, esc: number): PiezaAnim {
  return {
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    giro: new Animated.Value(0),
    escala: new Animated.Value(1),
    amp,
    esc,
  };
}

function Pieza({
  pieza,
  style,
  children,
}: {
  pieza: PiezaAnim;
  style?: any;
  children?: React.ReactNode;
}) {
  const rotacion = pieza.giro.interpolate({
    inputRange: [-35, 35],
    outputRange: ['-35deg', '35deg'],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateX: pieza.x },
            { translateY: pieza.y },
            { rotate: rotacion },
            { scale: pieza.escala },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default function TachadoScreen() {
  const [escuchando, setEscuchando] = useState(false);
  const [volumen, setVolumen] = useState(0);
  const [errorMic, setErrorMic] = useState('');
  const [orden, setOrden] = useState<string[]>(() => mezclar(POEMA));
  const [indice, setIndice] = useState(0);
  const [liberados, setLiberados] = useState<string[]>([]);
  const [completo, setCompleto] = useState(false);

  const grabadora = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  const estadoGrabacion = useAudioRecorderState(grabadora, 100);

  // Refs para evitar valores desactualizados dentro del efecto
  const progreso = useRef(0);
  const indiceRef = useRef(0);
  const ordenRef = useRef(orden);
  ordenRef.current = orden;
  const centrado = useRef(true);

  // Animaciones
  const barra = useRef(new Animated.Value(1)).current; // opacidad de la tachadura
  const fondo = useRef(new Animated.Value(0)).current;

  const p = useRef({
    marca: crearPieza(0.6, 0.15),
    linea: crearPieza(0.7, 0.3),
    instruccion: crearPieza(0.6, 0.15),
    letras: PALABRA.split('').map(() => crearPieza(1, 0.6)),
    tira: crearPieza(0.7, 0.12),
    estado: crearPieza(0.7, 0.2),
    medidor: crearPieza(0.6, 0.1),
    porcentaje: crearPieza(0.7, 0.2),
    liberados: crearPieza(0.5, 0.1),
    boton: crearPieza(0.4, 0.05),
    credito: crearPieza(0.7, 0.2),
  }).current;

  const todas: PiezaAnim[] = [
    p.marca,
    p.linea,
    p.instruccion,
    ...p.letras,
    p.tira,
    p.estado,
    p.medidor,
    p.porcentaje,
    p.liberados,
    p.boton,
    p.credito,
  ];

  // Desordena TODO según la intensidad de la voz.
  // Cuando hay silencio, todo vuelve suavemente al centro.
  function moverTodo(intensidad: number) {
    fondo.setValue(intensidad);

    const fuerza = Math.max(
      0,
      Math.min(1, (intensidad - UMBRAL_SILENCIO) / 0.5)
    );

    if (fuerza === 0) {
      if (!centrado.current) {
        centrado.current = true;

        todas.forEach((pz) => {
          Animated.parallel([
            Animated.spring(pz.x, {
              toValue: 0,
              friction: 6,
              tension: 80,
              useNativeDriver: false,
            }),
            Animated.spring(pz.y, {
              toValue: 0,
              friction: 6,
              tension: 80,
              useNativeDriver: false,
            }),
            Animated.spring(pz.giro, {
              toValue: 0,
              friction: 6,
              tension: 80,
              useNativeDriver: false,
            }),
            Animated.spring(pz.escala, {
              toValue: 1,
              friction: 6,
              tension: 80,
              useNativeDriver: false,
            }),
          ]).start();
        });
      }
      return;
    }

    centrado.current = false;

    todas.forEach((pz, i) => {
      const direccion = i % 2 === 0 ? 1 : -1;

      pz.x.setValue(
        Math.sin(i * 2.4 + intensidad * 12) *
          fuerza * 100 * pz.amp * direccion
      );

      pz.y.setValue(
        Math.cos(i * 1.8 + intensidad * 10) *
          fuerza * 65 * pz.amp
      );

      pz.giro.setValue(
        Math.sin(i + intensidad * 8) *
          fuerza * 35 * pz.amp
      );

      pz.escala.setValue(
        1 + fuerza * pz.esc * (i % 2 === 0 ? 1 : 0.65)
      );
    });
  }

  function reiniciarPoema() {
    const nuevoOrden = mezclar(POEMA);
    ordenRef.current = nuevoOrden;
    setOrden(nuevoOrden);
    indiceRef.current = 0;
    setIndice(0);
    setLiberados([]);
    setCompleto(false);
    progreso.current = 0;
    barra.setValue(1);
  }

  async function iniciarEscucha() {
    try {
      setErrorMic('');

      const permiso =
        await AudioModule.requestRecordingPermissionsAsync();

      if (!permiso.granted) {
        setErrorMic('PERMITÍ EL ACCESO AL MICRÓFONO PARA PODER GRITAR');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      if (completo) {
        reiniciarPoema();
      }

      await grabadora.prepareToRecordAsync();
      grabadora.record();

      setVolumen(0);
      setEscuchando(true);
    } catch (error) {
      console.error('Error al iniciar el micrófono:', error);
      setErrorMic('NO SE PUDO ACTIVAR EL MICRÓFONO');
    }
  }

  async function detenerEscucha(poemaTerminado = false) {
    try {
      await grabadora.stop();
    } catch (error) {
      console.error('Error al detener la grabación:', error);
    }

    setEscuchando(false);
    setVolumen(0);
    progreso.current = 0;
    barra.setValue(1);
    centrado.current = false; // fuerza el reacomodo al centro
    moverTodo(0);

    if (poemaTerminado) {
      setCompleto(true);
    }

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch (error) {
      console.error('Error al restaurar el audio:', error);
    }
  }

  function liberarVerso() {
    const verso = ordenRef.current[indiceRef.current];

    setLiberados((prev) => [...prev, verso]);

    indiceRef.current += 1;
    setIndice(indiceRef.current);
    progreso.current = 0;
    barra.setValue(1);

    if (indiceRef.current >= ordenRef.current.length) {
      detenerEscucha(true);
    }
  }

  // Leer continuamente el volumen del micrófono.
  useEffect(() => {
    if (!escuchando || !estadoGrabacion.isRecording || completo) {
      return;
    }

    const db = estadoGrabacion.metering;

    if (db == null || !Number.isFinite(db)) {
      return;
    }

    // Los decibelios suelen ser negativos.
    // Los convertimos a una intensidad de 0 a 1.
    const intensidad = Math.max(
      0,
      Math.min(1, (db + 60) / 60)
    );

    setVolumen(intensidad);
    moverTodo(intensidad);

    // Cuanto más fuerte y más sostenido el grito, más se rompe la tachadura.
    // Si dejás de gritar, la tachadura vuelve a cubrir el verso.
    if (intensidad >= UMBRAL_GRITO) {
      progreso.current = Math.min(
        1,
        progreso.current + 0.03 + (intensidad - UMBRAL_GRITO) * 0.5
      );
    } else if (intensidad < UMBRAL_SILENCIO) {
      progreso.current = Math.max(0, progreso.current - 0.06);
    } else {
      progreso.current = Math.max(0, progreso.current - 0.02);
    }

    barra.setValue(1 - progreso.current);

    if (progreso.current >= 1) {
      liberarVerso();
    }
  }, [
    escuchando,
    completo,
    estadoGrabacion.isRecording,
    estadoGrabacion.metering,
  ]);

  useEffect(() => {
    return () => {
      grabadora.stop().catch(() => {});
    };
  }, [grabadora]);

  const colorFondo = fondo.interpolate({
    inputRange: [0, 1],
    outputRange: ['#090909', '#650018'],
  });

  const versoActual = orden[indice];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <Animated.View
        style={[
          styles.container,
          { backgroundColor: colorFondo },
        ]}
      >
        <View style={styles.encabezado}>
          <Pieza pieza={p.marca}>
            <Text style={styles.marca}>
              LITERATURA DIGITAL · LO TACHADO
            </Text>
          </Pieza>
          <Pieza pieza={p.linea} style={styles.linea} />
        </View>

        <View style={styles.centro}>
          <Pieza pieza={p.instruccion}>
            <Text style={styles.instruccion}>
              {completo
                ? 'EL POEMA ESTÁ COMPLETO'
                : escuchando
                ? 'SEGUÍ GRITANDO PARA LEER EL POEMA'
                : 'GRITÁ PARA LEER EL POEMA'}
            </Text>
          </Pieza>

          <View style={styles.escenario}>
            {p.letras.map((letra, i) => (
              <Pieza key={i} pieza={letra}>
                <Text style={styles.letra}>{PALABRA[i]}</Text>
              </Pieza>
            ))}
          </View>

          {!completo && versoActual && (
            <Pieza pieza={p.tira} style={styles.tira}>
              <Text style={styles.verso}>
                {versoActual}
              </Text>

              <Animated.View
                pointerEvents="none"
                style={[styles.tachadura, { opacity: barra }]}
              />
            </Pieza>
          )}

          <Pieza pieza={p.estado}>
            <Text style={styles.estado}>
              {completo
                ? 'LO GRITASTE TODO'
                : !escuchando
                ? 'TOCÁ COMENZAR Y GRITÁ'
                : !estadoGrabacion.isRecording
                ? 'INICIANDO MICRÓFONO...'
                : volumen >= UMBRAL_GRITO
                ? '¡SEGUÍ GRITANDO!'
                : volumen > UMBRAL_SILENCIO
                ? 'MÁS FUERTE, GRITÁ MÁS'
                : '¡GRITÁ!'}
            </Text>
          </Pieza>

          <Pieza pieza={p.medidor} style={styles.medidor}>
            <View
              style={[
                styles.nivel,
                { width: `${volumen * 100}%` },
              ]}
            />
          </Pieza>

          <Pieza pieza={p.porcentaje}>
            <Text style={styles.porcentaje}>
              VERSOS LIBERADOS: {liberados.length} / {POEMA.length}
            </Text>
          </Pieza>

          <Pieza pieza={p.liberados} style={styles.liberados}>
            {liberados.map((verso, i) => (
              <Text key={`${verso}-${i}`} style={styles.versoLibre}>
                — {verso}
              </Text>
            ))}
          </Pieza>

          {errorMic !== '' && (
            <Text style={styles.error}>
              {errorMic}
            </Text>
          )}
        </View>

        <View style={styles.pie}>
          <Pieza pieza={p.boton} style={styles.botonWrap}>
            <Pressable
              style={[
                styles.boton,
                escuchando && styles.botonActivo,
              ]}
              onPress={
                escuchando
                  ? () => detenerEscucha(false)
                  : iniciarEscucha
              }
            >
              <Text style={styles.textoBoton}>
                {escuchando
                  ? '■  DETENER'
                  : completo
                  ? '↺  VOLVER A EMPEZAR'
                  : '◉  COMENZAR'}
              </Text>
            </Pressable>
          </Pieza>

          <Pieza pieza={p.credito}>
            <Text style={styles.credito}>
              SI NO GRITÁS, EL POEMA SE CALLA.
            </Text>
          </Pieza>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090909',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  encabezado: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  marca: {
    color: '#999999',
    fontSize: 10,
    letterSpacing: 3,
  },
  linea: {
    height: 1,
    width: 35,
    backgroundColor: '#FF2948',
  },
  centro: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruccion: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 18,
  },
  escenario: {
    width: '100%',
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letra: {
    color: '#F5F0EA',
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: '#FF2948',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tira: {
    width: '100%',
    backgroundColor: '#E9E2D3',
    paddingVertical: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginTop: 10,
  },
  verso: {
    color: '#111111',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  tachadura: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  estado: {
    color: '#FF4058',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 18,
  },
  medidor: {
    width: '80%',
    height: 4,
    backgroundColor: '#333333',
    marginTop: 12,
    overflow: 'hidden',
  },
  nivel: {
    height: 4,
    backgroundColor: '#FF2948',
  },
  porcentaje: {
    color: '#888888',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 8,
  },
  liberados: {
    width: '100%',
    marginTop: 14,
    gap: 6,
  },
  versoLibre: {
    color: '#F5F0EA',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  error: {
    color: '#FF7184',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  pie: {
    width: '100%',
    alignItems: 'center',
    gap: 18,
  },
  botonWrap: {
    width: '100%',
  },
  boton: {
    width: '100%',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#FF2948',
    alignItems: 'center',
  },
  botonActivo: {
    backgroundColor: '#30000B',
  },
  textoBoton: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  credito: {
    color: '#777777',
    fontSize: 9,
    letterSpacing: 2,
  },
});