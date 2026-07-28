import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { realtorApi, type ItemPool } from "@/lib/realtorApi";

export function useRealtorPerfil() {
  return useQuery({
    queryKey: ["realtor", "perfil"],
    queryFn: () => realtorApi.getPerfil(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRealtorAsignados() {
  return useQuery({
    queryKey: ["realtor", "asignados"],
    queryFn: () => realtorApi.getAsignados(),
    staleTime: 60 * 1000,
  });
}

export function useRealtorPool() {
  return useQuery({
    queryKey: ["realtor", "pool"],
    queryFn: () => realtorApi.getPool(),
    staleTime: 30 * 1000,
  });
}

export function useTomarDelPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => realtorApi.tomarDelPool(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["realtor", "pool"] });
      const prev = qc.getQueryData<ItemPool[]>(["realtor", "pool"]);
      qc.setQueryData<ItemPool[]>(["realtor", "pool"], (old) => old?.filter((p) => p.id !== id) ?? []);
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(["realtor", "pool"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["realtor", "pool"] }),
  });
}

export function useMisListings() {
  return useQuery({
    queryKey: ["realtor", "listings"],
    queryFn: () => realtorApi.getMisListings(),
    staleTime: 60 * 1000,
  });
}

export function usePublicarAsignado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (intakeId: string) => realtorApi.publicarAsignado(intakeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "asignados"] });
      qc.invalidateQueries({ queryKey: ["realtor", "listings"] });
    },
  });
}

export function useAceptarAsignado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (intakeId: string) => realtorApi.aceptarAsignado(intakeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "asignados"] });
      qc.invalidateQueries({ queryKey: ["realtor", "desempeno"] });
    },
  });
}

export function useDesempeno() {
  return useQuery({
    queryKey: ["realtor", "desempeno"],
    queryFn: () => realtorApi.getDesempeno(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAgenda() {
  return useQuery({
    queryKey: ["realtor", "agenda"],
    queryFn: () => realtorApi.getAgenda(),
    staleTime: 60 * 1000,
  });
}

export function useActualizarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado, resultado }: {
      id: string;
      estado: "confirmada" | "realizada" | "cancelada" | "no_asistio";
      resultado?: "interesado" | "oferta" | "descartado";
    }) => realtorApi.actualizarVisita(id, estado, resultado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "agenda"] });
      qc.invalidateQueries({ queryKey: ["realtor", "desempeno"] });
    },
  });
}

export function useDueDiligence(intakeId: string | null) {
  return useQuery({
    queryKey: ["realtor", "dd", intakeId],
    queryFn: () => realtorApi.getDueDiligence(intakeId!),
    enabled: intakeId !== null,
    staleTime: 30 * 1000,
  });
}

export function useVerificarDDItem(intakeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, estado, nota }: { itemId: string; estado: "verificado" | "rechazado"; nota?: string }) =>
      realtorApi.verificarDDItem(itemId, estado, nota),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "dd", intakeId] });
      qc.invalidateQueries({ queryKey: ["realtor", "asignados"] });
    },
  });
}

export function useEditarListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, campos, fotos }: {
      listingId: string;
      campos: import("@/lib/realtorApi").ListingPatch;
      fotos: File[];
    }) => {
      if (Object.keys(campos).length > 0) await realtorApi.actualizarListing(listingId, campos);
      if (fotos.length > 0) await realtorApi.subirFotosListing(listingId, fotos);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["realtor", "asignados"] });
      qc.invalidateQueries({ queryKey: ["realtor", "listings"] });
    },
  });
}

export function useInteligenciaBarrio(zonaCodigo: string | null) {
  return useQuery({
    queryKey: ["realtor", "inteligencia", zonaCodigo],
    queryFn: () => realtorApi.getInteligenciaBarrio(zonaCodigo!),
    enabled: zonaCodigo !== null,
    staleTime: 5 * 60 * 1000,
  });
}
