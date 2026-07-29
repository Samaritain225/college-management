import { z } from "zod"

export const collegeIdentitySchema = z.object({
  name: z.string().trim().min(1, "Le nom du collège est requis."),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  academicYear: z.string().trim().optional(),
})

export type CollegeIdentityFormValues = z.infer<typeof collegeIdentitySchema>
