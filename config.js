// Paràmetres ajustables. Cap secret aquí (les claus de TMB viuen només al Worker).
export default {
  // URL del Cloudflare Worker (deixar buit mentre no estigui desplegat → només horari previst)
  workerUrl: "https://prat-igualada-api.marccgarciia-bus.workers.dev",
  // Minuts entre l'andana de la L9 i la parada de la Diagonal (i a l'inrevés)
  transbordamentMin: 8,
  // Temps de trajecte Les Moreres ↔ Zona Universitària. El valor de data/metro-horaris.json
  // (calculat del GTFS) té prioritat; aquest és només un valor de reserva APROXIMAT.
  tempsMetroMin: 17,
  // Mostrar autocars de tornada que surten només de l'Estació d'Autobusos (no passen per Pg. Verdaguer)?
  mostrarNomesEstacio: true,
  // Marge (min) per sota del qual la connexió es marca com a «justa»
  margeJustMin: 3,
  // Temps real només si l'autocar arriba a Zona Univ. abans d'aquests minuts
  tempsRealSiMenysDe: 30,
  timeoutApiMs: 4000,
  refrescMs: 30000,
  opcions: 4,
};
