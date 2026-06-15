import { z } from "zod";

export const telegramInboundSchema = z.object({
  message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z
        .object({
          id: z.union([z.number(), z.string()]),
          username: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const whatsappInboundSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z
                .array(
                  z.object({
                    id: z.string(),
                    from: z.string(),
                    text: z.object({ body: z.string() }).optional(),
                    image: z.object({ id: z.string().optional() }).optional(),
                  }),
                )
                .optional(),
              contacts: z
                .array(
                  z.object({
                    profile: z.object({ name: z.string() }).optional(),
                    wa_id: z.string(),
                  }),
                )
                .optional(),
              metadata: z
                .object({ display_phone_number: z.string().optional() })
                .optional(),
            }),
          }),
        ),
      }),
    )
    .optional(),
});

export type TelegramInbound = z.infer<typeof telegramInboundSchema>;
export type WhatsappInbound = z.infer<typeof whatsappInboundSchema>;
