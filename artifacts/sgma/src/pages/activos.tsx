import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAssets, 
  useCreateAsset, 
  useUpdateAsset, 
  useDeleteAsset,
  useListLocations,
  useListWorkCenters,
  getListAssetsQueryKey,
  getListLocationsQueryKey,
  getListWorkCentersQueryKey
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
import { Box, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAssetStatusColor, getAssetStatusLabel } from "@/lib/format";

const formSchema = z.object({
  codigo: z.string().min(1, "Requerido"),
  nombre: z.string().min(1, "Requerido"),
  tipo: z.string().min(1, "Requerido"),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  serie: z.string().optional(),
  anio: z.coerce.number().optional().nullable(),
  estado: z.string().min(1, "Requerido"),
  ubicacionId: z.coerce.number().optional().nullable(),
  centroTrabajoId: z.coerce.number().optional().nullable(),
  responsable: z.string().optional(),
  horometro: z.coerce.number().optional().nullable(),
  kilometraje: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Assets() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");

  const queryParams = {
    search: search || undefined,
    estado: estadoFilter !== "all" ? estadoFilter : undefined,
    tipo: tipoFilter !== "all" ? tipoFilter : undefined
  };

  const { data: assets, isLoading } = useListAssets(queryParams, { query: { queryKey: getListAssetsQueryKey(queryParams) } });
  const { data: locations } = useListLocations({ query: { queryKey: getListLocationsQueryKey() } });
  const { data: centers } = useListWorkCenters({ query: { queryKey: getListWorkCentersQueryKey() } });
  
  const createMutation = useCreateAsset();
  const updateMutation = useUpdateAsset();
  const deleteMutation = useDeleteAsset();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo: "",
      nombre: "",
      tipo: "",
      estado: "operativo",
      marca: "",
      modelo: "",
      serie: "",
      anio: null,
      ubicacionId: null,
      centroTrabajoId: null,
      responsable: "",
      horometro: null,
      kilometraje: null
    },
  });

  const onSubmit = (values: FormValues) => {
    const data = {
      ...values,
      anio: values.anio || undefined,
      ubicacionId: values.ubicacionId || undefined,
      centroTrabajoId: values.centroTrabajoId || undefined,
      horometro: values.horometro || undefined,
      kilometraje: values.kilometraje || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
            toast({ title: "Activo actualizado" });
            setIsOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
            toast({ title: "Activo creado" });
            setIsOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditingId(item.id);
    form.reset({
      codigo: item.codigo,
      nombre: item.nombre,
      tipo: item.tipo,
      estado: item.estado,
      marca: item.marca || "",
      modelo: item.modelo || "",
      serie: item.serie || "",
      anio: item.anio || null,
      ubicacionId: item.ubicacionId || null,
      centroTrabajoId: item.centroTrabajoId || null,
      responsable: item.responsable || "",
      horometro: item.horometro || null,
      kilometraje: item.kilometraje || null,
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.reset({ 
      codigo: "", nombre: "", tipo: "equipo_movil", estado: "operativo", marca: "", modelo: "", serie: "", anio: null, ubicacionId: null, centroTrabajoId: null, responsable: "", horometro: null, kilometraje: null
    });
    setIsOpen(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(
        { id: deleteId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
            toast({ title: "Activo eliminado" });
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
          <h1 className="text-3xl font-bold tracking-tight">Activos</h1>
          <p className="text-muted-foreground mt-1">Catálogo de equipos y maquinaria.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Activo
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o nombre..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="operativo">Operativo</SelectItem>
            <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
            <SelectItem value="fuera_servicio">Fuera de Servicio</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="equipo_movil">Equipo Móvil</SelectItem>
            <SelectItem value="equipo_fijo">Equipo Fijo</SelectItem>
            <SelectItem value="vehiculo">Vehículo</SelectItem>
            <SelectItem value="herramienta">Herramienta</SelectItem>
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
        ) : !assets || assets.length === 0 ? (
          <Empty 
            icon={Box}
            title="No hay activos"
            description="No se encontraron activos con los filtros actuales."
            action={<Button onClick={handleCreate}>Crear Activo</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Marca/Modelo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/activos/${a.id}`)}>
                    <TableCell className="font-medium">{a.codigo}</TableCell>
                    <TableCell>{a.nombre}</TableCell>
                    <TableCell className="capitalize">{a.tipo.replace('_', ' ')}</TableCell>
                    <TableCell>{a.marca ? `${a.marca} ${a.modelo || ''}` : '-'}</TableCell>
                    <TableCell>{a.ubicacionNombre || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getAssetStatusColor(a.estado)}>
                        {getAssetStatusLabel(a.estado)}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.responsable || "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => handleEdit(e, a)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteId(a.id); }}>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Activo" : "Nuevo Activo"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: EQ-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Montacargas" {...field} />
                      </FormControl>
                      <FormMessage />
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
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="equipo_movil">Equipo Móvil</SelectItem>
                          <SelectItem value="equipo_fijo">Equipo Fijo</SelectItem>
                          <SelectItem value="vehiculo">Vehículo</SelectItem>
                          <SelectItem value="herramienta">Herramienta</SelectItem>
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
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="operativo">Operativo</SelectItem>
                          <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                          <SelectItem value="fuera_servicio">Fuera de Servicio</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="marca" render={({ field }) => (
                  <FormItem><FormLabel>Marca</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="modelo" render={({ field }) => (
                  <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="anio" render={({ field }) => (
                  <FormItem><FormLabel>Año</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ubicacionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ubicación</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "null" ? null : parseInt(val))} value={field.value ? field.value.toString() : "null"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">Ninguna</SelectItem>
                          {locations?.map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.nombre}</SelectItem>)}
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
                          <SelectItem value="null">Ninguno</SelectItem>
                          {centers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
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
            <AlertDialogTitle>¿Eliminar activo?</AlertDialogTitle>
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