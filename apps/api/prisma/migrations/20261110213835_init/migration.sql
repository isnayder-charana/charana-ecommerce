-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `sku` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `price_cents` INTEGER UNSIGNED NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `stock` INTEGER UNSIGNED NOT NULL,
    `image_url` VARCHAR(500) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_category_name_idx`(`category`, `name`),
    FULLTEXT INDEX `products_name_description_idx`(`name`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
