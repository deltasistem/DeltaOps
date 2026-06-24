import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListSpareParts, 
  useCreateSparePart, 
  useUpdateSparePart, 
  useDeleteSparePart,
  useCreateStockMovement,
  useListLocations,
  getListSparePartsQueryKey
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
import { Label } from "@/components/ui/label";
import { Wrench, Plus, Pencil, Trash2, Search, ArrowRightLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatCurrency } from "@/lib/format";

const formSchema = z.object({
  codigo: z.string().min(1, "Requerido"),
  descripcion: z.string().min(1, "Requerido"),
  categoria: z.string().optional(),
  stock: z.coerce.number().min(0),
  stockMinimo: z.coerce.number().min(0),
  stockMaximo: z.coerce.number().optional().nullable(),
  costoUnitario: z.coerce.number().optional().nullable(),
  ubicacionId: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const movementSchema = z.object({
  tipo: z.string().min(1),
  cantidad: z.coerce.number().min(1),
  motivo: z.string().optional()
});
type MovementValues = z.infer<typeof movementSchema>;

export default function SpareParts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);

  const queryParams = {
    search: search || undefined,
    lowStock: lowStock ? true : undefined
  };

  const { data: parts, isLoading } = useListSpareParts(queryParams, { query: { queryKey: getListSparePartsQueryKey(queryParams) } });
  const { data: locations } = useListLocations();
  
  const createMutation = useCreateSparePart();
  const updateMutation = useUpdateSparePart();
  const deleteMutation = useDeleteSparePart();
  const moveMutation = useCreateStockMovement();

  const [isOpen, setIsOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [movingPart, setMovingPart] = useState<any>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { codigo: "", descripcion: "", categoria: "", stock: 0, stockMinimo: 0, stockMaximo: null, costoUnitario: null, ubicacionId: null },
  });

  const moveForm = useForm<MovementValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { tipo: "entrada", cantidad: 1, motivo: "" }
  });

  const onSubmit = (values: FormValues) => {
    const data: any = { ...values };
    if (data.stockMaximo === null) delete data.stockMaximo;
    if (data.costoUnitario === null) delete data.costoUnitario;
    if (data.ubicacionId === null) delete data.ubicacionId;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSparePartsQueryKey() });
          toast({ title: "Repuesto actualizado" });
          setIsOpen(false);
        },
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSparePartsQueryKey() });
          toast({ title: "Repuesto creado" });
          setIsOpen(false);
        },
      });
    }
  };

  const onMoveSubmit = (values: MovementValues) => {
    if (!movingPart) return;
    moveMutation.mutate({ id: movingPart.id, data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSparePartsQueryKey() });
        toast({ title: "Movimiento registrado" });
        setIsMoveOpen(false);
      }
    });
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      codigo: item.codigo,
      descripcion: item.descripcion,
      categoria: item.categoria || "",
      stock: item.stock,
      stockMinimo: item.stockMinimo,
      stockMaximo: item.stockMaximo || null,
      costoUnitario: item.costoUnitario || null,
      ubicacionId: item.ubicacionId || null,
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.reset({ codigo: "", descripcion: "", categoria: "", stock: 0, stockMinimo: 5, stockMaximo: null, costoUnitario: null, ubicacionId: null });
    setIsOpen(true);
  };

  const handleMove = (item: any) => {
    setMovingPart(item);
    moveForm.reset({ tipo: "entrada", cantidad: 1, motivo: "" });
    setIsMoveOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventario de Repuestos</h1>
          <p className="text-muted-foreground mt-1">Catálogo y control de stock.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Repuesto
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código o descripción..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center space-x-2 border rounded-md px-3 py-2 bg-card">
          <Switch id="low-stock" checked={lowStock} onCheckedChange={setLowStock} />
          <Label htmlFor="low-stock">Solo bajo stock</Label>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
          </div>
        ) : !parts || parts.length === 0 ? (
          <Empty icon={Wrench} title="No hay repuestos" description="No se encontraron repuestos." action={<Button onClick={handleCreate}>Crear Repuesto</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Costo Unit.</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p) => {
                  const isLow = p.stock <= p.stockMinimo;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.codigo}</TableCell>
                      <TableCell>{p.descripcion}</TableCell>
                      <TableCell>{p.categoria || "-"}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-medium ${isLow ? 'text-red-500 bg-red-500/10 px-2 py-1 rounded-md' : ''}`}>
                          {p.stock}
                        </span>
                        <span className="text-xs text-muted-foreground block">Min: {p.stockMinimo}</span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(p.costoUnitario)}</TableCell>
                      <TableCell>{p.ubicacionNombre || "-"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Movimiento" onClick={() => handleMove(p)}>
                            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Repuesto" : "Nuevo Repuesto"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="codigo" render={({ field }) => (
                  <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={form.control} name="categoria" render={({ field }) => (
                  <FormItem><FormLabel>Categoría (Opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="descripcion" render={({ field }) => (
                <FormItem><FormLabel>Descripción</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="stock" render={({ field }) => (
                  <FormItem><FormLabel>Stock Actual</FormLabel><FormControl><Input type="number" {...field} disabled={!!editingId} /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={form.control} name="stockMinimo" render={({ field }) => (
                  <FormItem><FormLabel>Stock Mínimo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={form.control} name="stockMaximo" render={({ field }) => (
                  <FormItem><FormLabel>Max (Opc.)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="costoUnitario" render={({ field }) => (
                  <FormItem><FormLabel>Costo Unitario ($)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ubicacionId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bodega / Ubicación</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "null" ? null : parseInt(val))} value={field.value ? field.value.toString() : "null"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="null">Ninguna</SelectItem>
                        {locations?.filter(l => l.tipo === 'bodega').map(l => <SelectItem key={l.id} value={l.id.toString()}>{l.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4"><Button variant="outline" type="button" onClick={() => setIsOpen(false)}>Cancelar</Button><Button type="submit">Guardar</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
            <DialogDescription>{movingPart?.codigo} - {movingPart?.descripcion}</DialogDescription>
          </DialogHeader>
          <Form {...moveForm}>
            <form onSubmit={moveForm.handleSubmit(onMoveSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={moveForm.control} name="tipo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Movimiento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada (+)</SelectItem>
                        <SelectItem value="salida">Salida (-)</SelectItem>
                        <SelectItem value="ajuste">Ajuste (Reemplaza)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={moveForm.control} name="cantidad" render={({ field }) => (
                  <FormItem><FormLabel>Cantidad</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={moveForm.control} name="motivo" render={({ field }) => (
                <FormItem><FormLabel>Motivo / Referencia</FormLabel><FormControl><Input placeholder="Ej: OT-2024-001" {...field} /></FormControl></FormItem>
              )} />
              <DialogFooter className="pt-4"><Button variant="outline" type="button" onClick={() => setIsMoveOpen(false)}>Cancelar</Button><Button type="submit" disabled={moveMutation.isPending}>Registrar</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar repuesto?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => {if(deleteId) deleteMutation.mutate({id: deleteId}, {onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListSparePartsQueryKey()});setDeleteId(null);}})}} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}