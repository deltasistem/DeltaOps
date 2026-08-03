/**
 * DGP-007 · Dynamic Forms Engine (@workspace/dynamic-forms) — API pública.
 *
 * Motor de formularios y checklists declarativos, neutro respecto al negocio.
 * Runtime + contratos TypeScript puros + persistencia vía RecordStorePort. La
 * UI llega en otra tarea; este paquete NO depende de React.
 */
export * from "./definicion";
export * from "./condiciones";
export * from "./validacion";
export * from "./layout";
export * from "./checklist";
export * from "./evidencias";
export * from "./vocabulario";
export * from "./plantillas";
export * from "./respuestas";
export * from "./resolutor";
export * from "./modulo";
export * from "./runtime";
