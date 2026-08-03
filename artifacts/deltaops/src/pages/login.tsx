import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { useDeltaopsLogin, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const loginMutation = useDeltaopsLogin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getDeltaopsMeQueryKey() });
        setLocation("/");
      },
    },
  });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values });
  }

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left side: branding/industrial texture */}
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 border-r border-sidebar-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-sidebar-primary">
            <Activity className="h-8 w-8" />
            <span className="text-2xl font-bold tracking-tight text-white">DeltaOps</span>
          </div>
          <p className="mt-4 text-sidebar-foreground/70 font-mono text-sm uppercase tracking-wider max-w-sm">
            Control de Mantenimiento de Precisión // Plataforma EAM Grado Industrial
          </p>
        </div>

        <div className="relative z-10 border border-sidebar-accent p-6 rounded-sm bg-sidebar/50 backdrop-blur-sm max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-500 text-xs font-mono uppercase tracking-widest">Sistemas Operativos</span>
          </div>
          <p className="text-sidebar-foreground/80 text-sm leading-relaxed">
            Gestión centralizada de activos, seguimiento de costos y orquestación de operaciones para flotas de alta disponibilidad.
          </p>
        </div>
      </div>

      {/* Right side: Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Acceso Restringido</h1>
            <p className="text-muted-foreground text-sm">
              Ingrese sus credenciales de operador para acceder a la plataforma.
            </p>
          </div>

          {loginMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                Credenciales inválidas o acceso denegado. Verifique e intente nuevamente.
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="operador@empresa.com"
                        className="font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full font-bold uppercase tracking-wider"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Verificando..." : "Iniciar Sesión"}
              </Button>
            </form>
          </Form>

          <div className="text-center">
            <p className="text-xs text-muted-foreground font-mono">
              DeltaOps System // v0.1.0-alpha
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
