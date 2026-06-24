import {
  db,
  locationsTable,
  workCentersTable,
  assetsTable,
  techniciansTable,
  suppliersTable,
  sparePartsTable,
  workOrdersTable,
  maintenancePlansTable,
} from "@workspace/db";

async function main() {
  // Clear in dependency order
  await db.delete(workOrdersTable);
  await db.delete(maintenancePlansTable);
  await db.delete(sparePartsTable);
  await db.delete(assetsTable);
  await db.delete(techniciansTable);
  await db.delete(suppliersTable);
  await db.delete(workCentersTable);
  await db.delete(locationsTable);

  const locations = await db
    .insert(locationsTable)
    .values([
      { nombre: "Terminal Marítimo Buenaventura", tipo: "terminal", direccion: "Muelle 3, Zona Portuaria", ciudad: "Buenaventura" },
      { nombre: "Planta de Fertilizantes Yumbo", tipo: "planta", direccion: "Km 5 Vía Yumbo", ciudad: "Yumbo" },
      { nombre: "Patio de Carbón La Dorada", tipo: "patio", direccion: "Zona Industrial", ciudad: "La Dorada" },
      { nombre: "Bodega Central Palmira", tipo: "bodega", direccion: "Calle 42 #28-15", ciudad: "Palmira" },
      { nombre: "Sede Administrativa Cali", tipo: "sede", direccion: "Av. 6N #25-30", ciudad: "Cali" },
    ])
    .returning();

  const centers = await db
    .insert(workCentersTable)
    .values([
      { nombre: "Taller Mecánico Principal", tipo: "taller_mecanico", descripcion: "Reparación de maquinaria pesada", responsable: "Carlos Mejía" },
      { nombre: "Taller Eléctrico", tipo: "taller_electrico", descripcion: "Sistemas eléctricos e instrumentación", responsable: "Andrea Solís" },
      { nombre: "Patio de Mantenimiento", tipo: "patio", descripcion: "Mantenimiento de campo", responsable: "Jorge Patiño" },
      { nombre: "Planta de Lubricación", tipo: "planta", descripcion: "Engrase y cambio de aceites", responsable: "Luis Fernando Gómez" },
    ])
    .returning();

  const techs = await db
    .insert(techniciansTable)
    .values([
      { nombre: "Carlos Mejía", rol: "coordinador", especialidad: "Maquinaria pesada", certificaciones: "ISO 55000, Soldadura SMAW", telefono: "3155678901", email: "cmejia@logistica.co", centroTrabajoId: centers[0].id },
      { nombre: "Andrea Solís", rol: "supervisor", especialidad: "Sistemas eléctricos", certificaciones: "RETIE, PLC Siemens", telefono: "3204567812", email: "asolis@logistica.co", centroTrabajoId: centers[1].id },
      { nombre: "Jorge Patiño", rol: "tecnico", especialidad: "Hidráulica", certificaciones: "Hidráulica móvil nivel II", telefono: "3112233445", email: "jpatino@logistica.co", centroTrabajoId: centers[2].id },
      { nombre: "Luis Fernando Gómez", rol: "tecnico", especialidad: "Lubricación", certificaciones: "Tribología nivel I", telefono: "3009988776", email: "lgomez@logistica.co", centroTrabajoId: centers[3].id },
      { nombre: "Diana Ramírez", rol: "tecnico", especialidad: "Motores diésel", certificaciones: "Cummins, Caterpillar", telefono: "3187766554", email: "dramirez@logistica.co", centroTrabajoId: centers[0].id },
    ])
    .returning();

  await db.insert(suppliersTable).values([
    { nombre: "Distribuidora Hidráulica del Valle", tipo: "proveedor_repuestos", contacto: "María López", telefono: "6024567890", email: "ventas@hidrovalle.co", calificacion: 4.5 },
    { nombre: "Servicios Industriales Pacífico", tipo: "contratista", contacto: "Roberto Díaz", telefono: "6023344556", email: "info@sipacifico.co", calificacion: 4.0 },
    { nombre: "Taller Especializado Diésel Cali", tipo: "taller", contacto: "Hernán Castro", telefono: "6027788990", email: "contacto@dieselcali.co", calificacion: 4.8 },
    { nombre: "Repuestos y Filtros La 14", tipo: "proveedor_repuestos", contacto: "Sandra Ruiz", telefono: "6021122334", email: "pedidos@filtrosla14.co", calificacion: 3.9 },
  ]);

  const assets = await db
    .insert(assetsTable)
    .values([
      { codigo: "MON-001", nombre: "Cargador Frontal Caterpillar 966", tipo: "maquinaria_pesada", marca: "Caterpillar", modelo: "966M", serie: "CAT966M2024A", anio: 2021, ubicacionId: locations[2].id, centroTrabajoId: centers[0].id, estado: "operativo", responsable: "Jorge Patiño", horometro: 8420, horasAcumuladas: 8420, vidaUtil: 20000, notas: "Uso intensivo en patio de carbón" },
      { codigo: "MON-002", nombre: "Montacargas Hyster 7 Ton", tipo: "maquinaria_pesada", marca: "Hyster", modelo: "H7.0FT", serie: "HYS70FT2022B", anio: 2022, ubicacionId: locations[0].id, centroTrabajoId: centers[0].id, estado: "operativo", responsable: "Diana Ramírez", horometro: 4150, horasAcumuladas: 4150, vidaUtil: 15000 },
      { codigo: "MON-003", nombre: "Retroexcavadora JCB 3CX", tipo: "maquinaria_pesada", marca: "JCB", modelo: "3CX", serie: "JCB3CX2020C", anio: 2020, ubicacionId: locations[1].id, centroTrabajoId: centers[0].id, estado: "mantenimiento", responsable: "Jorge Patiño", horometro: 11200, horasAcumuladas: 11200, vidaUtil: 18000, notas: "En reparación de sistema hidráulico" },
      { codigo: "VEH-001", nombre: "Volqueta Kenworth T800", tipo: "vehiculo", marca: "Kenworth", modelo: "T800", serie: "KWT8002019D", anio: 2019, ubicacionId: locations[2].id, centroTrabajoId: centers[2].id, estado: "operativo", responsable: "Diana Ramírez", horometro: 9800, kilometraje: 245000, horasAcumuladas: 9800, vidaUtil: 25000 },
      { codigo: "VEH-002", nombre: "Tractocamión Freightliner Cascadia", tipo: "vehiculo", marca: "Freightliner", modelo: "Cascadia", serie: "FLC2023E", anio: 2023, ubicacionId: locations[3].id, centroTrabajoId: centers[2].id, estado: "operativo", responsable: "Diana Ramírez", horometro: 3200, kilometraje: 98000, horasAcumuladas: 3200, vidaUtil: 30000 },
      { codigo: "EST-001", nombre: "Banda Transportadora Carbón L1", tipo: "equipo_estatico", marca: "FENNER", modelo: "BT-1200", serie: "FEN12002018F", anio: 2018, ubicacionId: locations[2].id, centroTrabajoId: centers[1].id, estado: "operativo", responsable: "Andrea Solís", horasAcumuladas: 32000, vidaUtil: 50000 },
      { codigo: "EST-002", nombre: "Tolva de Recepción de Fertilizante", tipo: "equipo_estatico", marca: "MetalAgro", modelo: "TR-50", serie: "MA50TR2017G", anio: 2017, ubicacionId: locations[1].id, centroTrabajoId: centers[0].id, estado: "operativo", responsable: "Carlos Mejía", horasAcumuladas: 28000, vidaUtil: 45000 },
      { codigo: "EST-003", nombre: "Ensacadora Automática Bagger 50kg", tipo: "equipo_estatico", marca: "Concetti", modelo: "IGF-600", serie: "CON6002021H", anio: 2021, ubicacionId: locations[1].id, centroTrabajoId: centers[1].id, estado: "fuera_servicio", responsable: "Andrea Solís", horasAcumuladas: 14500, vidaUtil: 40000, notas: "Falla en sistema neumático, esperando repuesto" },
      { codigo: "EST-004", nombre: "Compresor de Tornillo Atlas Copco", tipo: "equipo_estatico", marca: "Atlas Copco", modelo: "GA90", serie: "AC90GA2019I", anio: 2019, ubicacionId: locations[0].id, centroTrabajoId: centers[1].id, estado: "operativo", responsable: "Andrea Solís", horasAcumuladas: 21000, vidaUtil: 40000 },
    ])
    .returning();

  const parts = await db
    .insert(sparePartsTable)
    .values([
      { codigo: "FIL-001", descripcion: "Filtro de aceite Caterpillar 1R-0716", categoria: "Filtros", stock: 24, stockMinimo: 10, stockMaximo: 50, costoUnitario: 85000, ubicacionId: locations[3].id },
      { codigo: "FIL-002", descripcion: "Filtro de combustible Racor 2020", categoria: "Filtros", stock: 6, stockMinimo: 8, stockMaximo: 40, costoUnitario: 62000, ubicacionId: locations[3].id },
      { codigo: "FIL-003", descripcion: "Filtro de aire primario Donaldson", categoria: "Filtros", stock: 18, stockMinimo: 6, stockMaximo: 30, costoUnitario: 120000, ubicacionId: locations[3].id },
      { codigo: "LUB-001", descripcion: "Aceite hidráulico ISO 68 (caneca 55gal)", categoria: "Lubricantes", stock: 12, stockMinimo: 5, stockMaximo: 25, costoUnitario: 980000, ubicacionId: locations[1].id },
      { codigo: "LUB-002", descripcion: "Aceite motor 15W40 (caneca 55gal)", categoria: "Lubricantes", stock: 3, stockMinimo: 5, stockMaximo: 20, costoUnitario: 1150000, ubicacionId: locations[1].id },
      { codigo: "COR-001", descripcion: "Correa transportadora 1200mm (metro)", categoria: "Bandas", stock: 45, stockMinimo: 20, stockMaximo: 100, costoUnitario: 240000, ubicacionId: locations[2].id },
      { codigo: "NEU-001", descripcion: "Llanta 17.5R25 cargador", categoria: "Neumáticos", stock: 2, stockMinimo: 4, stockMaximo: 12, costoUnitario: 4800000, ubicacionId: locations[3].id },
      { codigo: "HID-001", descripcion: "Manguera hidráulica 1\" SAE 100R2", categoria: "Hidráulica", stock: 30, stockMinimo: 15, stockMaximo: 60, costoUnitario: 95000, ubicacionId: locations[0].id },
      { codigo: "NEU-002", descripcion: "Válvula neumática 1/2\" Festo", categoria: "Neumática", stock: 1, stockMinimo: 3, stockMaximo: 15, costoUnitario: 320000, ubicacionId: locations[1].id },
    ])
    .returning();

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
  const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000);

  let n = 0;
  const num = () => `OT-${String(++n).padStart(5, "0")}`;

  await db.insert(workOrdersTable).values([
    { numero: num(), equipoId: assets[2].id, tipo: "correctivo", prioridad: "alta", estado: "en_proceso", tecnicoId: techs[2].id, centroTrabajoId: centers[0].id, descripcion: "Reparación sistema hidráulico", reporteFalla: "Pérdida de presión en brazo cargador", diagnostico: "Sello de cilindro principal dañado", causaRaiz: "Desgaste por horas de operación", horasEstimadas: 16, horasReales: 10, costoManoObra: 850000, costoRepuestos: 1200000, fechaCreacion: daysAgo(3), fechaProgramada: daysAgo(1) },
    { numero: num(), equipoId: assets[7].id, tipo: "correctivo", prioridad: "critica", estado: "esperando_repuesto", tecnicoId: techs[1].id, centroTrabajoId: centers[1].id, descripcion: "Falla sistema neumático ensacadora", reporteFalla: "No sella las bolsas correctamente", diagnostico: "Válvula neumática Festo defectuosa", horasEstimadas: 8, costoManoObra: 0, costoRepuestos: 0, fechaCreacion: daysAgo(5), fechaProgramada: daysAgo(2) },
    { numero: num(), equipoId: assets[0].id, tipo: "preventivo", prioridad: "media", estado: "cerrado", tecnicoId: techs[3].id, centroTrabajoId: centers[3].id, descripcion: "Cambio de aceite y filtros 500h", solucion: "Cambio completo de aceite hidráulico y filtros", horasEstimadas: 4, horasReales: 3.5, costoManoObra: 280000, costoRepuestos: 420000, fechaCreacion: daysAgo(45), fechaProgramada: daysAgo(44), fechaCierre: daysAgo(43) },
    { numero: num(), equipoId: assets[3].id, tipo: "preventivo", prioridad: "media", estado: "finalizado", tecnicoId: techs[4].id, centroTrabajoId: centers[2].id, descripcion: "Mantenimiento 10.000 km", solucion: "Revisión general, cambio de aceite motor", horasEstimadas: 6, horasReales: 5, costoManoObra: 350000, costoRepuestos: 680000, fechaCreacion: daysAgo(20), fechaProgramada: daysAgo(18), fechaCierre: daysAgo(17) },
    { numero: num(), equipoId: assets[5].id, tipo: "correctivo", prioridad: "alta", estado: "cerrado", tecnicoId: techs[1].id, centroTrabajoId: centers[1].id, descripcion: "Empalme de banda transportadora", reporteFalla: "Banda rasgada en empalme", solucion: "Vulcanizado de empalme en caliente", causaRaiz: "Sobrecarga de material", horasEstimadas: 12, horasReales: 14, costoManoObra: 1100000, costoRepuestos: 720000, fechaCreacion: daysAgo(60), fechaProgramada: daysAgo(59), fechaCierre: daysAgo(58) },
    { numero: num(), equipoId: assets[1].id, tipo: "preventivo", prioridad: "baja", estado: "pendiente", centroTrabajoId: centers[0].id, descripcion: "Inspección 250 horas montacargas", horasEstimadas: 3, costoManoObra: 0, costoRepuestos: 0, fechaCreacion: daysAgo(1), fechaProgramada: daysAhead(5) },
    { numero: num(), equipoId: assets[8].id, tipo: "predictivo", prioridad: "media", estado: "asignado", tecnicoId: techs[1].id, centroTrabajoId: centers[1].id, descripcion: "Análisis de vibraciones compresor", reporteFalla: "Ruido anormal detectado", horasEstimadas: 4, costoManoObra: 0, costoRepuestos: 0, fechaCreacion: daysAgo(2), fechaProgramada: daysAhead(2) },
    { numero: num(), equipoId: assets[4].id, tipo: "preventivo", prioridad: "media", estado: "cerrado", tecnicoId: techs[4].id, centroTrabajoId: centers[2].id, descripcion: "Mantenimiento preventivo 5.000 km", solucion: "Cambio de aceite y revisión de frenos", horasEstimadas: 5, horasReales: 4.5, costoManoObra: 320000, costoRepuestos: 540000, fechaCreacion: daysAgo(75), fechaProgramada: daysAgo(74), fechaCierre: daysAgo(73) },
    { numero: num(), equipoId: assets[6].id, tipo: "correctivo", prioridad: "media", estado: "cerrado", tecnicoId: techs[0].id, centroTrabajoId: centers[0].id, descripcion: "Reparación de tolva", reporteFalla: "Obstrucción en compuerta", solucion: "Limpieza y ajuste de actuador", horasEstimadas: 6, horasReales: 7, costoManoObra: 480000, costoRepuestos: 230000, fechaCreacion: daysAgo(90), fechaProgramada: daysAgo(89), fechaCierre: daysAgo(88) },
    { numero: num(), equipoId: assets[0].id, tipo: "correctivo", prioridad: "alta", estado: "cerrado", tecnicoId: techs[2].id, centroTrabajoId: centers[0].id, descripcion: "Cambio de llantas delanteras", reporteFalla: "Desgaste irregular", solucion: "Reemplazo de 2 llantas 17.5R25", horasEstimadas: 4, horasReales: 3, costoManoObra: 240000, costoRepuestos: 9600000, fechaCreacion: daysAgo(110), fechaProgramada: daysAgo(109), fechaCierre: daysAgo(108) },
  ]);

  await db.insert(maintenancePlansTable).values([
    { nombre: "Cambio aceite hidráulico - Cargador 966", equipoId: assets[0].id, tipoFrecuencia: "horometro", intervalo: 500, unidad: "horas", descripcion: "Cambio de aceite hidráulico y filtros", proximoHorometro: 9000, activo: true },
    { nombre: "Inspección general - Montacargas Hyster", equipoId: assets[1].id, tipoFrecuencia: "horometro", intervalo: 250, unidad: "horas", descripcion: "Inspección de seguridad y niveles", proximoHorometro: 4400, activo: true },
    { nombre: "Mantenimiento km - Volqueta Kenworth", equipoId: assets[3].id, tipoFrecuencia: "kilometraje", intervalo: 10000, unidad: "km", descripcion: "Servicio mayor de motor y frenos", activo: true },
    { nombre: "Engrase banda transportadora", equipoId: assets[5].id, tipoFrecuencia: "tiempo", intervalo: 30, unidad: "dias", descripcion: "Engrase de rodillos y poleas", proximaFecha: daysAhead(8), activo: true },
    { nombre: "Revisión compresor Atlas Copco", equipoId: assets[8].id, tipoFrecuencia: "horometro", intervalo: 2000, unidad: "horas", descripcion: "Cambio de filtros y aceite de compresor", proximoHorometro: 22000, activo: true },
    { nombre: "Mantenimiento ensacadora", equipoId: assets[7].id, tipoFrecuencia: "tiempo", intervalo: 90, unidad: "dias", descripcion: "Revisión sistema neumático", proximaFecha: daysAhead(20), activo: false },
  ]);

  process.stdout.write("Seed completado correctamente\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Error en seed: ${String(err)}\n`);
  process.exit(1);
});
