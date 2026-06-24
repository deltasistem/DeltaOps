import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListWorkOrders, 
  useCreateWorkOrder, 
  useUpdateWorkOrder, 
  useDeleteWorkOrder,
  useListAssets,
  useListTechnicians,
  useListWorkCenters,
  getListWorkOrdersQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState as Empty } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getPriorityColor, getWorkOrderStatusColor, formatCurrency, formatDateTime } from "@/lib/format";

const formSchema = z.object({
  equipoId: z.coerce.number().min(1, "Requerido"),
  tipo: z.string().min(1, "Requerido"),
  prioridad: z.string().min(1, "Requerido"),
  estado: z.string().min(1, "Requerido"),
  tecnicoId: z.coerce.number().optional().nullable(),
  centroTrabajoId: z.coerce.number().optional().nullable(),
  descripcion: z.string().optional(),
  reporteFalla: z.string().optional(),
  diagnostico: z.string().optional(),
  causaRaiz: z.string().optional(),
  solucion: z.string().optional(),
  horasEstimadas: z.coerce.number().optional().nullable(),
  horasReales: z.coerce.number().optional().nullable(),
  costoManoObra: z.coerce.number().optional().nullable(),
  costoRepuestos: z.coerce.number().optional().nullable(),
  fechaProgramada: z.string().optional(),
  fechaCierre: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

export default function WorkOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [prioridadFilter, setPrioridadFilter] = useState("all");

  const queryParams = {
    estado: estadoFilter !== "all" ? estadoFilter : undefined,
    tipo: tipoFilter !== "all" ? tipoFilter : undefined,
    prioridad: prioridadFilter !== "all" ? prioridadFilter : undefined
  };

  const { data: orders, isLoading } = useListWorkOrders(queryParams, { query: { queryKey: getListWorkOrdersQueryKey(queryParams) } });
  const { data: assets } = useListAssets();
  const { data: technicians } = useListTechnicians();
  const { data: centers } = useListWorkCenters();
  
  const createMutation = useCreateWorkOrder();
  const updateMutation = useUpdateWorkOrder();
  const deleteMutation = useDeleteWorkOrder();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      equipoId: 0,
      tipo: "correctivo",
      prioridad: "media",
      estado: "pendiente",
      tecnicoId: null,
      centroTrabajoId: null,
      descripcion: "",
      reporteFalla: "",
      diagnostico: "",
      causaRaiz: "",
      solucion: "",
      horasEstimadas: null,
      horasReales: null,
      costoManoObra: null,
      costoRepuestos: null,
      fechaProgramada: "",
      fechaCierre: ""
    },
  });

  const onSubmit = (values: FormValues) => {
    // Clean up empty strings or nulls for the API
    const data: any = { ...values };
    Object.keys(data).forEach(key => {
      if (data[key] === "" || data[key] === null) delete data[key];
    });

    // Ensure datetimes are ISO if provided
    if (data.fechaProgramada) data.fechaProgramada = new Date(data.fechaProgramada).toISOString();
    if (data.fechaCierre) data.fechaCierre = new Date(data.fechaCierre).toISOString();

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
            toast({ title: "OT actualizada" });
            setIsOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
            toast({ title: "OT creada" });
            setIsOpen(false);
          },
        }
      );
    }
  };

  const toLocalDatetimeInput = (isoString?: string | null) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      equipoId: item.equipoId,
      tipo: item.tipo,
      prioridad: item.prioridad,
      estado: item.estado,
      tecnicoId: item.tecnicoId || null,
      centroTrabajoId: item.centroTrabajoId || null,
      descripcion: item.descripcion || "",
      reporteFalla: item.reporteFalla || "",
      diagnostico: item.diagnostico || "",
      causaRaiz: item.causaRaiz || "",
      solucion: item.solucion || "",
      horasEstimadas: item.horasEstimadas || null,
      horasReales: item.horasReales || null,
      costoManoObra: item.costoManoObra || null,
      costoRepuestos: item.costoRepuestos || null,
      fechaProgramada: toLocalDatetimeInput(item.fechaProgramada),
      fechaCierre: toLocalDatetimeInput(item.fechaCierre),
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.reset({ 
      equipoId: assets?.[0]?.id || 0, tipo: "correctivo", prioridad: "media", estado: "pendiente", 
      tecnicoId: null, centroTrabajoId: null, descripcion: "", reporteFalla: "", diagnostico: "", causaRaiz: "", solucion: "",
      horasEstimadas: null, horasReales: null, costoManoObra: null, costoRepuestos: null, fechaProgramada: "", fechaCierre: ""
    });
    setIsOpen(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(
        { id: deleteId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey() });
            toast({ title: "OT eliminada" });
            setDeleteId(null);
          },
        }
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Órdenes de Trabajo</h1>
          <p className="text-muted-foreground mt-1">Gestión y seguimiento de OTs.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva OT
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="asignado">Asignado</SelectItem>
            <SelectItem value="en_proceso">En Proceso</SelectItem>
            <SelectItem value="esperando_repuesto">Esperando Repuesto</SelectItem>
            <SelectItem value="finalizado">Finalizado</SelectItem>
            <SelectItem value="cerrado">Cerrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="preventivo">Preventivo</SelectItem>
            <SelectItem value="correctivo">Correctivo</SelectItem>
            <SelectItem value="predictivo">Predictivo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioridadFilter} onValueChange={setPrioridadFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <Empty 
            icon={ClipboardList}
            title="No hay órdenes de trabajo"
            description="No se encontraron OTs con los filtros actuales."
            action={<Button onClick={handleCreate}>Crear OT</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Tipo / Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Técnico Asignado</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium whitespace-nowrap">{o.numero}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{o.equipoNombre}</span>
                        <span className="text-xs text-muted-foreground">{o.equipoCodigo}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant="outline" className="capitalize">{o.tipo}</Badge>
                        <Badge variant="outline" className={getPriorityColor(o.prioridad)}>{o.prioridad}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${getWorkOrderStatusColor(o.estado)}`}>
                        {o.estado.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{o.tecnicoNombre || <span className="text-muted-foreground italic">No asignado</span>}</TableCell>
                    <TableCell className="text-right">{formatCurrency(o.costoTotal)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(o)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Orden de Trabajo" : "Nueva Orden de Trabajo"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="equipoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipo</FormLabel>
                      <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value ? field.value.toString() : ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {assets?.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.codigo} - {a.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pendiente">Pendiente</SelectItem>
                          <SelectItem value="asignado">Asignado</SelectItem>
                          <SelectItem value="en_proceso">En Proceso</SelectItem>
                          <SelectItem value="esperando_repuesto">Esperando Repuesto</SelectItem>
                          <SelectItem value="finalizado">Finalizado</SelectItem>
                          <SelectItem value="cerrado">Cerrado</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Mantenimiento</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="preventivo">Preventivo</SelectItem>
                          <SelectItem value="correctivo">Correctivo</SelectItem>
                          <SelectItem value="predictivo">Predictivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prioridad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="baja">Baja</SelectItem>
                          <SelectItem value="media">Media</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="critica">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tecnicoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Técnico Asignado</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "null" ? null : parseInt(val))} value={field.value ? field.value.toString() : "null"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">Sin asignar</SelectItem>
                          {technicians?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.nombre} ({t.rol})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="centroTrabajoId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Centro de Trabajo</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "null" ? null : parseInt(val))} value={field.value ? field.value.toString() : "null"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">Sin asignar</SelectItem>
                          {centers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="descripcion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción / Tarea a realizar</FormLabel>
                    <FormControl>
                      <Textarea placeholder="..." className="h-20" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fechaProgramada"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Programada</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fechaCierre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Cierre</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-4 grid grid-cols-4 gap-4">
                <FormField control={form.control} name="horasEstimadas" render={({ field }) => (
                  <FormItem><FormLabel>Horas Est.</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="horasReales" render={({ field }) => (
                  <FormItem><FormLabel>Horas Reales</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="costoManoObra" render={({ field }) => (
                  <FormItem><FormLabel>Costo M.O. ($)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="costoRepuestos" render={({ field }) => (
                  <FormItem><FormLabel>Costo Rep. ($)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Orden de Trabajo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}