import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListTechnicians, 
  useCreateTechnician, 
  useUpdateTechnician, 
  useDeleteTechnician,
  useListWorkCenters,
  getListTechniciansQueryKey,
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
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  nombre: z.string().min(1, "Requerido"),
  rol: z.string().min(1, "Requerido"),
  especialidad: z.string().optional(),
  certificaciones: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal('')),
  centroTrabajoId: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Technicians() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: technicians, isLoading } = useListTechnicians({ query: { queryKey: getListTechniciansQueryKey() } });
  const { data: centers } = useListWorkCenters({ query: { queryKey: getListWorkCentersQueryKey() } });
  
  const createMutation = useCreateTechnician();
  const updateMutation = useUpdateTechnician();
  const deleteMutation = useDeleteTechnician();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      rol: "",
      especialidad: "",
      certificaciones: "",
      telefono: "",
      email: "",
      centroTrabajoId: null,
    },
  });

  const onSubmit = (values: FormValues) => {
    const data = {
      ...values,
      centroTrabajoId: values.centroTrabajoId ? values.centroTrabajoId : undefined
    };
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTechniciansQueryKey() });
            toast({ title: "Personal actualizado" });
            setIsOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTechniciansQueryKey() });
            toast({ title: "Personal creado" });
            setIsOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      nombre: item.nombre,
      rol: item.rol,
      especialidad: item.especialidad || "",
      certificaciones: item.certificaciones || "",
      telefono: item.telefono || "",
      email: item.email || "",
      centroTrabajoId: item.centroTrabajoId || null,
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.reset({ 
      nombre: "", rol: "tecnico", especialidad: "", certificaciones: "", telefono: "", email: "", centroTrabajoId: null 
    });
    setIsOpen(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(
        { id: deleteId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTechniciansQueryKey() });
            toast({ title: "Personal eliminado" });
            setDeleteId(null);
          },
        }
      );
    }
  };

  const getRoleBadge = (rol: string) => {
    switch (rol) {
      case 'tecnico': return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20">Técnico</Badge>;
      case 'supervisor': return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20">Supervisor</Badge>;
      case 'coordinador': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">Coordinador</Badge>;
      default: return <Badge variant="outline">{rol}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Personal</h1>
          <p className="text-muted-foreground mt-1">Gestión de técnicos, supervisores y coordinadores.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Miembro
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !technicians || technicians.length === 0 ? (
          <Empty 
            icon={Users}
            title="No hay personal"
            description="Registra técnicos para asignarles órdenes de trabajo."
            action={<Button onClick={handleCreate}>Crear Miembro</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Especialidad</TableHead>
                  <TableHead>Teléfono / Email</TableHead>
                  <TableHead>Centro de Trabajo</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nombre}</TableCell>
                    <TableCell>{getRoleBadge(t.rol)}</TableCell>
                    <TableCell>{t.especialidad || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span>{t.telefono || "-"}</span>
                        <span className="text-muted-foreground">{t.email || ""}</span>
                      </div>
                    </TableCell>
                    <TableCell>{t.centroTrabajoNombre || "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Miembro" : "Nuevo Miembro"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Juan Pérez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tecnico">Técnico</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="coordinador">Coordinador</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="especialidad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Especialidad (Opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Mecánico" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="telefono"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Opcional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="centroTrabajoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Centro de Trabajo (Opcional)</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "null" ? null : parseInt(val))} 
                      value={field.value ? field.value.toString() : "null"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">Ninguno</SelectItem>
                        {centers?.map(c => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="certificaciones"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificaciones (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            <AlertDialogTitle>¿Eliminar personal?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente este registro.
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