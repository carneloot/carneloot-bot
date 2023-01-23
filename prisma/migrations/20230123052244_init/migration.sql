-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "telegramID" DOUBLE PRECISION NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_to_notify" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,

    CONSTRAINT "users_to_notify_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramID_key" ON "users"("telegramID");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_telegramID_username_idx" ON "users"("telegramID", "username");

-- CreateIndex
CREATE INDEX "notifications_keyword_ownerId_idx" ON "notifications"("keyword", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_ownerId_keyword_key" ON "notifications"("ownerId", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_value_key" ON "api_keys"("value");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_userId_key" ON "api_keys"("userId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_to_notify" ADD CONSTRAINT "users_to_notify_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_to_notify" ADD CONSTRAINT "users_to_notify_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
