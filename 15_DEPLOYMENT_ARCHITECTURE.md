# 15_DEPLOYMENT_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura de despliegue: entornos, migraciones, rollback y blue/green preparado.
> Documento de diseño. No implementa nada.

---

## 1. El camino de una versión

```text
Cambio → CONSTRUCCIÓN
  compila + verifica fronteras de módulos (`02` §6) + pruebas
  + escaneo de vulnerabilidades → IMAGEN INMUTABLE FIRMADA (una, versionada)
        ▼
DEV     despliegue continuo automático; humo básico
        ▼
QA      automático tras DEV verde: suite completa (contratos públicos,
        cross-tenant (`05` §1), sincronización móvil, presupuestos UX de
        referencia) sobre datos sintéticos con semilla
        ▼
UAT     promoción manual del responsable de release; validación de negocio;
        ensayo de migraciones contra volumen realista anonimizado
        ▼
PROD    promoción manual con ventana anunciada (aunque no exija corte);
        LA MISMA IMAGEN de principio a fin — solo cambian configuración
        y secretos por entorno (`14` §8)
```

Reglas: nada llega a un entorno sin pasar por el anterior; ninguna imagen sin firma se ejecuta; todo despliegue queda registrado (quién, qué versión, cuándo, resultado) — el despliegue también se audita.

## 2. Despliegue sin corte (mecánica estándar)

1. **Progresivo (rolling):** las instancias nuevas entran tras pasar disposición (`10` §5); las viejas drenan y salen. Las dos versiones conviven minutos → **toda versión N debe convivir con N-1** (contratos, eventos, esquema).
2. **Los trabajadores de colas** se despliegan igual: terminan su elemento en curso, sueltan el cursor y reinician con la versión nueva (los cursores y la idempotencia hacen el relevo seguro).
3. **Dispositivos móviles:** nunca dependen del despliegue — el protocolo soporta N y N-1 (`06` §6); las versiones mínimas se anuncian con antelación.
4. **Funcionalidad nueva desacoplada del despliegue:** el código llega apagado tras feature flags de plataforma (`09_FEATURE_FLAGS.md` de ETS-005, capa fabricante) y se enciende gradualmente — desplegar no es liberar.

## 3. Migraciones (evolución del esquema y los datos)

1. **Expandir → migrar → contraer:** primero se agrega lo nuevo (compatible con N-1), luego se migran los datos en segundo plano, al final —una o más versiones después— se retira lo viejo. **Jamás una migración destructiva en el mismo despliegue que la usa.**
2. **Migraciones versionadas, deterministas y ensayadas:** cada una corre exactamente una vez, en orden, registrada; se ensayan en UAT contra volumen realista con tiempo medido (una migración lenta se rediseña como trabajo en segundo plano, no bloquea el arranque).
3. **Los datos append-only no se migran, se reproyectan:** cambios de forma en read models/proyecciones se resuelven por replay (ETS-006/11) — construir la proyección nueva en paralelo, verificar, conmutar. Los eventos son inmunes al despliegue (esquemas aditivos, `04` §2).
4. **Compatibilidad de configuración:** las versiones de configuración del tenant (ETS-005) sobreviven a todo despliegue; una versión de plataforma que requiriese migrar configuración la migra con reglas automáticas auditadas y reporte al tenant.

## 4. Rollback

| Qué falló | Remedio |
|---|---|
| Defecto funcional tras liberar | **Apagar el flag** (segundos, sin despliegue) — la primera línea de defensa |
| Defecto en la versión desplegada | Redesplegar la imagen anterior (rolling inverso); posible siempre porque el esquema es compatible N/N-1 (expandir→contraer) |
| Migración de expansión defectuosa | Corregir hacia adelante (la expansión no rompió N-1 por diseño); las contracciones solo se ejecutan cuando ya nadie usa lo viejo |
| Datos dañados por defecto | Nunca "restaurar y perder": corrección por eventos compensatorios; restauración quirúrgica por tenant como último recurso (ETS-006/15 §4, reconciliación explícita) |

Regla: **el rollback se ensaya** (QA incluye desplegar N, subir a N+1, volver a N) — un rollback no ensayado es una esperanza, no un plan.

## 5. Blue/Green (preparado)

- La topología (`14`) permite mantener dos conjuntos completos (azul/verde) tras el balanceador y conmutar el tráfico de una vez, con vuelta instantánea.
- **Preparado significa:** instancias sin estado, sesión compartida externa, esquema compatible N/N-1 y estáticos por huella ya lo permiten hoy sin rediseño. Se adoptará si el perfil de riesgo lo justifica (releases mayores, migraciones delicadas); el modo estándar sigue siendo rolling + flags, que cubre el 95 % de los casos con menor costo.
- Variante natural: **canary por tenant** — enrutar tenants voluntarios a la versión nueva primero (los flags por tenant ya lo soportan, ETS-005/09).

## 6. Cadencia y responsabilidad

- **Releases pequeños y frecuentes** (riesgo proporcional al tamaño del cambio); ventanas de congelamiento configurables por temporada operativa de los tenants (cierre de mes minero, por ejemplo).
- Cada release tiene responsable, notas versionadas y verificación post-despliegue automática (sondas sintéticas, `10` §5) con criterio de éxito explícito: si las sondas fallan, el rollback es automático, no una deliberación.
