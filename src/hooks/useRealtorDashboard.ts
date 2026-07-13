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

export function useInteligenciaBarrio(zonaCodigo: string | null) {
  return useQuery({
    queryKey: ["realtor", "inteligencia", zonaCodigo],
    queryFn: () => realtorApi.getInteligenciaBarrio(zonaCodigo!),
    enabled: zonaCodigo !== null,
    staleTime: 5 * 60 * 1000,
  });
}
