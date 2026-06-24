export const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return "$0";
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getAssetStatusColor = (status: string | null | undefined) => {
  if (!status) return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20';
  switch (status.toLowerCase()) {
    case 'operativo': return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20';
    case 'mantenimiento': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20';
    case 'fuera_servicio': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
    default: return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20';
  }
};

export const getPriorityColor = (priority: string | null | undefined) => {
  if (!priority) return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20';
  switch (priority.toLowerCase()) {
    case 'baja': return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20';
    case 'media': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
    case 'alta': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20';
    case 'critica': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
    default: return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20';
  }
};

export const getWorkOrderStatusColor = (status: string | null | undefined) => {
  if (!status) return 'bg-slate-500/10 text-slate-500';
  switch (status.toLowerCase()) {
    case 'pendiente': return 'bg-slate-500/10 text-slate-500';
    case 'asignado': return 'bg-blue-500/10 text-blue-500';
    case 'en_proceso': return 'bg-amber-500/10 text-amber-500';
    case 'esperando_repuesto': return 'bg-orange-500/10 text-orange-500';
    case 'finalizado': return 'bg-emerald-500/10 text-emerald-500';
    case 'cerrado': return 'bg-gray-500/10 text-gray-500';
    default: return 'bg-slate-500/10 text-slate-500';
  }
};

export const getAssetStatusLabel = (status: string | null | undefined) => {
  if (!status) return '-';
  switch (status.toLowerCase()) {
    case 'operativo': return 'Operativo';
    case 'mantenimiento': return 'Mantenimiento';
    case 'fuera_servicio': return 'Fuera de Servicio';
    default: return status;
  }
};
