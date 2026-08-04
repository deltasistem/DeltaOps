/** DGP-008.1 · Módulo Activos Empresariales — API pública del paquete. */
export * from "./domain/value-objects";
export * from "./domain/maquina-estados";
export * from "./domain/activo";
export * from "./domain/policies";
export * from "./domain/catalogos";
export * from "./infrastructure/repository";
export { CatalogoService } from "./infrastructure/catalogo-service";
export { activosModule, MODULO, type ModuleAdapters } from "./module";
export * from "./sincronizacion";
export * from "./runtime";
