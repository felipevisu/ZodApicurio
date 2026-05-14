import { z } from "zod"

export const User = z.object({ "id": z.string().uuid(), "email": z.string().email(), "displayName": z.string().min(1).max(100).optional() }).strict()
