# Carneloot Bot Refactor Specification

## Overview
Refactor the `carneloot-bot` to be a pure Effect application, replacing the Hono web server with `@effect/platform` and unifying the application runtime and lifecycle management. The goal is to have a single entry point in `src/index.ts` that executes a composed Effect program.

## Goals
1.  **Remove `src/runtime.ts`**: The application runtime should be defined and managed within the main entry point, likely using `ManagedRuntime` or `BunRuntime.runMain`.
2.  **Replace Hono**: Replace `hono` with `@effect/platform` and `@effect/platform-bun` for HTTP handling.
3.  **Unified Lifecycle**: Compose the Telegram Bot (Grammy), HTTP Server, and Background Queues into a single Layer/Program.
4.  **Effect-Native**: Ensure all services and side effects are managed via Effect layers and services.

## Architecture

### Entry Point (`src/index.ts`)
-   Will use `BunRuntime.runMain` (or similar) to execute the `MainLive` layer.
-   Responsible for constructing the final `Layer` that merges the App, Bot, and Server.

### Main Program
-   A composed Effect that keeps the application running.
-   Should handle the startup of the Bot (polling vs webhook mode) and the HTTP Server.

### HTTP Server (`src/api/server.ts` or similar)
-   Define routes using `@effect/platform/Http/Router`.
-   Port existing Hono routes:
    -   `POST /api/notify`: Send notifications via the bot.
    -   `GET /api/set-webhook`: Setup webhook (if in webhook mode).
    -   `POST /api/webhook/:secret`: Handle Telegram webhooks.

### Bot Layer (`src/lib/services/bot.ts`)
-   Wrap the `grammy` Bot instance in an Effect Service.
-   Provide capabilities to `start`, `setWebhook`, `sendMessage`, etc.
-   The `createBot` logic in `src/bot.ts` should be adapted to be consumed as a service.

### Queue Layer
-   Refactor `PetFoodNotificationQueue` to be a proper Effect Service/Layer.
-   Remove dependency on `src/runtime.ts`.
-   Inject `BotService` instead of manual instantiation.

### Services
-   Refactor `NotificationService` to consume `BotService` via `Effect.service`.

### Static Files
-   Ensure the HTTP Server serves static files from `public/` (e.g., `auth-1.jpg`).

## Implementation Plan
1.  **Refactor Bot Initialization**: detailed in `src/lib/services/bot.ts` to be a proper Effect Service.
2.  **Refactor Services**: Update `NotificationService` and `PetFoodNotificationQueue` to use the new `BotService`.
3.  **Create HTTP Router**: Implement the API routes using `@effect/platform` and serve static files.
4.  **Create Main Program**: Compose the layers.
5.  **Update Entry Point**: Rewrite `src/index.ts`.
6.  **Cleanup**: Remove `src/runtime.ts`, remove Hono dependency.
