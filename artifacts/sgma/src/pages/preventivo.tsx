import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMaintenancePlans, 
  useCreateMaintenancePlan, 
  useUpdateMaintenancePlan, 
  useDeleteMaintenancePlan,
  useListAssets,
  getListMaintenancePlansQueryKey
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
import { Switch } from "@/components/ui/switch";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatDate } from "@/lib/format";

const formSchema = z.object({
  nombre: z.string().min(1, "Requerido"),
  equipoId: z.coerce.number().min(1, "Requerido"),
  tipoFrecuencia: z.string().min(1, "Requerido"),
  intervalo: z.coerce.number().min(1, "Requerido"),
  unidad: z.string().optional(),
  descripcion: z.string().optional(),
  proximaFecha: z.string().optional(),
  proximoHorometro: z.coerce.number().optional().nullable(),
  activo: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function MaintenancePlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: plans, isLoading } = useListMaintenancePlans({ query: { queryKey: getListMaintenancePlansQueryKey() } });
  const { data: assets } = useListAssets();
  
  const createMutation = useCreateMaintenancePlan();
  const updateMutation = useUpdateMaintenancePlan();
  const deleteMutation = useDeleteMaintenancePlan();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      equipoId: 0,
      tipoFrecuencia: "tiempo",
      intervalo: 1,
      unidad: "meses",
      descripcion: "",
      proximaFecha: "",
      proximoHorometro: null,
      activo: true,
    },
  });

  const onSubmit = (values: FormValues) => {
    const data: any = { ...values };
    if (data.proximaFecha) data.proximaFecha = new Date(data.proximaFecha).toISOString();
    else delete data.proximaFecha;
    
    if (data.proximoHorometro === null) delete data.proximoHorometro;

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMaintenancePlansQueryKey() });
            toast({ title: "Plan actualizado" });
            setIsOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMaintenancePlansQueryKey() });
            toast({ title: "Plan creado" });
            setIsOpen(false);
          },
        }
      );
    }
  };

  const handleToggleActive = (id: number, currentActive: boolean) => {
    updateMutation.mutate(
      { id, data: { activo: !currentActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMaintenancePlansQueryKey() });
          toast({ title: !currentActive ? "Plan activado" : "Plan pausado" });
        }
      }
    );
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      nombre: item.nombre,
      equipoId: item.equipoId,
      tipoFrecuencia: item.tipoFrecuencia,
      intervalo: item.intervalo,
      unidad: item.unidad || "",
      descripcion: item.descripcion || "",
      proximaFecha: item.proximaFecha ? new Date(item.proximaFecha).toISOString().split('T')[0] : "",
      proximoHorometro: item.proximoHorometro || null,
      activo: item.activo,
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.reset({ 
      nombre: "", equipoId: assets?.[0]?.id || 0, tipoFrecuencia: "tiempo", intervalo: 1, unidad: "meses", descripcion: "", proximaFecha: "", proximoHorometro: null, activo: true 
    });
    setIsOpen(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(
        { id: deleteId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMaintenancePlansQueryKey() });
            toast({ title: "Plan eliminado" });
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
          <h1 className="text-3xl font-bold tracking-tight">Mantenimiento Preventivo</h1>
          <p className="text-muted-foreground mt-1">Planes periódicos de mantenimiento.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Plan
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !plans || plans.length === 0 ? (
          <Empty 
            icon={CalendarDays}
            title="No hay planes preventivos"
            description="Crea tu primer plan de mantenimiento preventivo."
            action={<Button onClick={handleCreate}>Crear Plan</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activo</TableHead>
                  <TableHead>Nombre del Plan</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Próximo Mtto</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Switch 
                        checked={p.activo} 
                        onCheckedChange={() => handleToggleActive(p.id, p.activo)} 
                      />
                    </TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>{p.equipoNombre}</TableCell>
                    <TableCell>
                      Cada {p.intervalo} {p.tipoFrecuencia === 'tiempo' ? p.unidad : p.tipoFrecuencia === 'horometro' ? 'horas' : 'km'}
                    </TableCell>
                    <TableCell>
                      {p.tipoFrecuencia === 'tiempo' 
                        ? formatDate(p.proximaFecha) 
                        : p.tipoFrecuencia === 'horometro' 
                          ? `${p.proximoHorometro || '-'} h` 
                          : `${p.proximoHorometro || '-'} km`}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Plan" : "Nuevo Plan Preventivo"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Plan</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Mantenimiento 250h" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipoFrecuencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frecuencia por</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tiempo">Tiempo</SelectItem>
                          <SelectItem value="horometro">Horómetro</SelectItem>
                          <SelectItem value="kilometraje">Kilometraje</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="intervalo"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Intervalo</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("tipoFrecuencia") === "tiempo" && (
                    <FormField
                      control={form.control}
                      name="unidad"
                      render={({ field }) => (
                        <FormItem className="w-24">
                          <FormLabel>Unidad</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="dias">Días</SelectItem>
                              <SelectItem value="semanas">Sem.</SelectItem>
                              <SelectItem value="meses">Meses</SelectItem>
                              <SelectItem value="anios">Años</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {form.watch("tipoFrecuencia") === "tiempo" ? (
                <FormField
                  control={form.control}
                  name="proximaFecha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próxima Fecha</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="proximoHorometro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próximo {form.watch("tipoFrecuencia") === "horometro" ? "Horómetro" : "Kilometraje"}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value || ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

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
            <AlertDialogTitle>¿Eliminar plan?</AlertDialogTitle>
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