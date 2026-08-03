/**
 * DGP-005 · Galería viva del Design System oficial de DeltaOps.
 * Documentación visual: tokens, temas y componentes con sus estados.
 * No contiene lógica de negocio.
 */
import { useState } from "react";
import {
  brand,
  gris,
  semantico,
  Button,
  IconButton,
  Spinner,
  Divider,
  Logo,
  Badge,
  Chip,
  Avatar,
  Field,
  Input,
  PasswordInput,
  SearchInput,
  Textarea,
  Checkbox,
  RadioGroup,
  Radio,
  Switch as DoSwitch,
  Select,
  FormActions,
  Tooltip,
  Dropdown,
  Modal,
  Drawer,
  Alert,
  ToastProvider,
  useToast,
  Progress,
  Skeleton,
  Accordion,
  Tabs,
  Table as DoTable,
  Pagination,
  Breadcrumb,
  KpiCard,
  EmptyState,
  ErrorState,
  Timeline,
  OfflineBadge,
  Card as DoCard,
  CardHeader as DoCardHeader,
  CardContent as DoCardContent,
  PageHeader,
  Section,
  Toolbar,
} from "@workspace/design-system";
import { Plus, Pencil, Trash2, Settings } from "lucide-react";

function Muestra({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="do-card" style={{ padding: "var(--do-sp-4)", display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <h3 style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)", textTransform: "uppercase", letterSpacing: "var(--do-tracking-etiquetas)" }}>{titulo}</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-3)", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Paleta() {
  const colores: [string, string][] = [
    ["Blanco", brand.blanco],
    ["Rojo", brand.rojo],
    ["Rojo Oscuro", brand.rojoOscuro],
    ["Oceano", brand.oceano],
    ["Negro", brand.negro],
  ];
  return (
    <Muestra titulo="Paleta oficial (Brandbook)">
      {colores.map(([n, c]) => (
        <div key={n} style={{ textAlign: "center", fontSize: "var(--do-text-xs)" }}>
          <div style={{ width: 64, height: 40, background: c, border: "1px solid var(--do-borde)", borderRadius: "var(--do-radius-sm)" }} />
          {n}
          <div style={{ color: "var(--do-texto-suave)" }}>{c}</div>
        </div>
      ))}
      {Object.entries(gris).map(([k, c]) => (
        <div key={k} style={{ textAlign: "center", fontSize: "var(--do-text-xs)" }}>
          <div style={{ width: 36, height: 24, background: c, borderRadius: "var(--do-radius-sm)" }} />
          {k}
        </div>
      ))}
      {Object.entries(semantico).map(([k, c]) => (
        <div key={k} style={{ textAlign: "center", fontSize: "var(--do-text-xs)" }}>
          <div style={{ width: 48, height: 24, background: c, borderRadius: "var(--do-radius-sm)" }} />
          {k}
        </div>
      ))}
    </Muestra>
  );
}

function DemoToast() {
  const { mostrar } = useToast();
  return (
    <Button variant="secundario" onClick={() => mostrar({ titulo: "Operación exitosa", mensaje: "Los cambios fueron guardados.", variant: "exito" })}>
      Mostrar toast
    </Button>
  );
}

function Galeria() {
  const [tema, setTema] = useState<"light" | "dark">("light");
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [pagina, setPagina] = useState(2);
  const [radio, setRadio] = useState("a");
  const [sw, setSw] = useState(true);

  return (
    <div className="do-root" data-do-theme={tema} style={{ minHeight: "100vh", background: "var(--do-bg)", padding: "var(--do-sp-6)" }}>
      <div style={{ maxWidth: "var(--do-max-ancho)", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }}>
        <PageHeader
          titulo="Design System DeltaOps"
          descripcion="Galería oficial de tokens y componentes (DGP-005). Marca DELTA según Brandbook."
          acciones={
            <Button variant="secundario" onClick={() => setTema(tema === "light" ? "dark" : "light")}>
              Tema: {tema === "light" ? "Claro" : "Oscuro"}
            </Button>
          }
        />

        <Muestra titulo="Logotipo oficial (mínimos Brandbook: imagotipo 90px, isotipo 20px)">
          <span style={{ background: "var(--do-blanco)", padding: "var(--do-sp-3)", borderRadius: "var(--do-radius-md)", border: "1px solid var(--do-borde)" }}>
            <Logo variant="imagotipo" width={140} />
          </span>
          <span style={{ background: "var(--do-oceano)", padding: "var(--do-sp-3)", borderRadius: "var(--do-radius-md)" }}>
            <Logo variant="imagotipo-oscuro" width={140} />
          </span>
          <Logo variant="isotipo" width={32} />
        </Muestra>

        <Paleta />

        <Muestra titulo="Tipografía (Montserrat títulos · Roboto textos)">
          <div>
            <h1 style={{ fontSize: "var(--do-text-3xl)", fontWeight: "var(--do-peso-bold)" }}>Título Montserrat</h1>
            <p style={{ fontFamily: "var(--do-font-secundaria)" }}>Texto de párrafo en Roboto — plataforma de gestión de activos.</p>
            <code style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-sm)" }}>Roboto Mono · A-001-XYZ</code>
          </div>
        </Muestra>

        <Muestra titulo="Botones (variantes · estados)">
          <Button>Primario</Button>
          <Button variant="secundario">Secundario</Button>
          <Button variant="fantasma">Fantasma</Button>
          <Button variant="peligro">Peligro</Button>
          <Button disabled>Deshabilitado</Button>
          <Button loading>Cargando</Button>
          <Button size="sm">Pequeño</Button>
          <Button size="lg">Grande</Button>
          <IconButton label="Ajustes" variant="secundario"><Settings size={20} /></IconButton>
          <IconButton label="Eliminar" variant="peligro"><Trash2 size={20} /></IconButton>
        </Muestra>

        <Muestra titulo="Badges · Chips · Avatares · Estado de conexión">
          <Badge>Neutro</Badge>
          <Badge variant="primario">Primario</Badge>
          <Badge variant="exito">Éxito</Badge>
          <Badge variant="advertencia">Advertencia</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="info">Info</Badge>
          <Chip onRemove={() => undefined}>Filtro activo</Chip>
          <Avatar nombre="Ana Díaz" />
          <Avatar nombre="Luis Rojas" size="lg" />
          <OfflineBadge estado="offline" />
          <OfflineBadge estado="sincronizando" />
          <OfflineBadge estado="sincronizado" />
        </Muestra>

        <Section titulo="Formularios">
          <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Field label="Correo electrónico" description="Usaremos su correo corporativo." required>
              <Input placeholder="operador@empresa.com" />
            </Field>
            <Field label="Contraseña" required>
              <PasswordInput />
            </Field>
            <Field label="Buscar activo">
              <SearchInput placeholder="Buscar…" />
            </Field>
            <Field label="Con error" error="Este campo es obligatorio.">
              <Input />
            </Field>
            <Field label="Notas">
              <Textarea rows={2} />
            </Field>
            <Field label="Planta">
              <Select>
                <option>Planta Norte</option>
                <option>Planta Sur</option>
              </Select>
            </Field>
          </div>
          <Toolbar>
            <Checkbox label="Acepto los términos" defaultChecked />
            <DoSwitch label="Notificaciones" checked={sw} onChange={(e) => setSw(e.target.checked)} />
            <RadioGroup label="Prioridad" value={radio} onChange={setRadio} orientation="horizontal">
              <Radio value="a" label="Alta" />
              <Radio value="b" label="Media" />
              <Radio value="c" label="Baja" />
            </RadioGroup>
          </Toolbar>
          <FormActions>
            <Button variant="secundario">Cancelar</Button>
            <Button>Guardar</Button>
          </FormActions>
        </Section>

        <Muestra titulo="Overlays">
          <Button variant="secundario" onClick={() => setModal(true)}>Abrir modal</Button>
          <Button variant="secundario" onClick={() => setDrawer(true)}>Abrir drawer</Button>
          <Tooltip contenido="Información adicional"><Button variant="fantasma">Tooltip</Button></Tooltip>
          <Dropdown
            disparador={<>Acciones ▾</>}
            items={[
              { etiqueta: "Nuevo", icono: Plus },
              { etiqueta: "Editar", icono: Pencil },
              { etiqueta: "Eliminar", icono: Trash2 },
            ]}
          />
          <DemoToast />
        </Muestra>

        <Muestra titulo="Feedback">
          <div style={{ display: "grid", gap: "var(--do-sp-3)", width: "100%" }}>
            <Alert variant="exito" titulo="Guardado">La operación se completó correctamente.</Alert>
            <Alert variant="advertencia" titulo="Atención">Hay cambios sin sincronizar.</Alert>
            <Alert variant="error" titulo="Error">No fue posible conectar con el servidor.</Alert>
            <Alert variant="info" titulo="Información">El mantenimiento está programado para el sábado.</Alert>
            <Progress value={62} etiqueta="Progreso de sincronización" />
            <Progress etiqueta="Cargando" />
            <div style={{ display: "flex", gap: "var(--do-sp-3)", alignItems: "center" }}>
              <Skeleton forma="circulo" />
              <Skeleton forma="linea" style={{ flex: 1 }} />
              <Spinner />
            </div>
          </div>
        </Muestra>

        <Muestra titulo="Navegación y datos">
          <div style={{ display: "grid", gap: "var(--do-sp-4)", width: "100%" }}>
            <Breadcrumb items={[{ label: "Consola", href: "#" }, { label: "Activos", href: "#" }, { label: "Bomba P-101" }]} />
            <Tabs
              items={[
                { id: "t1", etiqueta: "Resumen", contenido: <p>Contenido del resumen.</p> },
                { id: "t2", etiqueta: "Historial", contenido: <p>Contenido del historial.</p> },
              ]}
            />
            <Accordion
              items={[
                { id: "a1", encabezado: "¿Qué es DeltaOps?", contenido: "Plataforma EAM de DELTA." },
                { id: "a2", encabezado: "¿Cómo sincronizo?", contenido: "La sincronización es automática al recuperar conexión." },
              ]}
            />
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <KpiCard titulo="Órdenes abiertas" valor="128" delta={{ valor: "+12%", tendencia: "positiva" }} />
              <KpiCard titulo="Tiempo medio de reparación" valor="4,2 h" delta={{ valor: "-8%", tendencia: "negativa" }} />
              <KpiCard titulo="Activos monitoreados" valor="1.024" />
            </div>
            <DoTable caption="Órdenes de trabajo recientes">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>OT-1001</td><td>Bomba P-101</td><td><Badge variant="exito">Cerrada</Badge></td></tr>
                <tr><td>OT-1002</td><td>Motor M-204</td><td><Badge variant="advertencia">En curso</Badge></td></tr>
                <tr><td>OT-1003</td><td>Válvula V-330</td><td><Badge variant="error">Vencida</Badge></td></tr>
              </tbody>
            </DoTable>
            <Pagination pagina={pagina} totalPaginas={5} onChange={setPagina} />
            <Timeline
              eventos={[
                { titulo: "Orden creada", hora: "08:12", descripcion: "Creada por A. Díaz", tono: "primario" },
                { titulo: "Asignada a técnico", hora: "09:30" },
                { titulo: "Cerrada", hora: "14:05", tono: "exito" },
              ]}
            />
            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <EmptyState titulo="Sin resultados" descripcion="No se encontraron elementos con los filtros aplicados." accion={{ label: "Limpiar filtros", onClick: () => undefined }} />
              <ErrorState titulo="Error de carga" descripcion="No fue posible obtener los datos." onReintentar={() => undefined} />
            </div>
          </div>
        </Muestra>

        <DoCard>
          <DoCardHeader>
            <h3 style={{ fontSize: "var(--do-text-lg)", fontWeight: "var(--do-peso-semibold)" }}>Divider y superficies</h3>
          </DoCardHeader>
          <DoCardContent>
            <p>Superficie de tarjeta con elevación 1.</p>
            <Divider />
            <p style={{ color: "var(--do-texto-suave)" }}>Texto secundario sobre superficie.</p>
          </DoCardContent>
        </DoCard>
      </div>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Confirmar acción"
        pie={
          <FormActions>
            <Button variant="secundario" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => setModal(false)}>Confirmar</Button>
          </FormActions>
        }
      >
        <p>¿Desea confirmar esta acción?</p>
      </Modal>
      <Drawer abierto={drawer} onClose={() => setDrawer(false)} titulo="Panel lateral">
        <p>Contenido del panel lateral.</p>
      </Drawer>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <ToastProvider>
      <Galeria />
    </ToastProvider>
  );
}
