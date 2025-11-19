# Age Range Checkout Extension

A Shopify checkout extension that adds an age range selector field to the checkout process.

## Features

- Age range selection dropdown with predefined options
- Required field validation that blocks checkout progression
- Stores age range as checkout attribute
- Clean UI that matches Shopify checkout styling
- Compliant with accessibility standards

## Quick Start

### Prerequisites

1. Node.js 16+ installed
2. Shopify CLI installed: `npm install -g @shopify/cli`
3. Shopify Partner account
4. Development store

### Installation

1. **Download this project** to your local machine
2. **Navigate to the project directory:**
   ```bash
   cd age-range-checkout-extension
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Link to your Shopify app:**
   - In your Shopify Partner Dashboard, create a new app
   - Get the config link command (looks like `shopify app config link`)
   - Run that command in your project directory

5. **Update your development store URL:**
   Edit `shopify.app.toml` and set:
   ```toml
   dev_store_url = "your-store.myshopify.com"
   ```

6. **Start development:**
   ```bash
   npm run dev
   ```

7. **Test the extension:**
   - Go to your development store
   - Add a product to cart → Go to checkout
   - You should see the age range selector

## File Structure

```
age-range-checkout-extension/
├── package.json                                    # Dependencies and scripts
├── shopify.app.toml                               # App configuration
├── .gitignore                                     # Git ignore rules
├── README.md                                      # This file
└── extensions/
    └── age-range-selector/
        ├── shopify.extension.toml                 # Extension configuration
        └── src/
            └── Checkout.jsx                       # Main extension component
```

## Configuration

### Age Range Options

Edit `src/Checkout.jsx` to modify the age ranges:

```javascript
const ageRangeOptions = [
  { value: '', label: 'Please select your age range' },
  { value: '13-17', label: '13-17 years old' },
  { value: '18-24', label: '18-24 years old' },
  // Add your custom ranges here
];
```

### Make Field Optional

To make the field optional (not required), remove this code block from `src/Checkout.jsx`:

```javascript
// Remove this entire useBuyerJourneyIntercept block
useBuyerJourneyIntercept(({ canBlockProgress }) => {
  // ... validation code
});
```

## Data Access

The selected age range is stored as a checkout attribute with key `age_range`. Access it via:

1. **Order webhooks:** `order.note_attributes` or `order.attributes`
2. **Shopify Admin:** Order details → Additional details
3. **Admin API:** Order resource attributes

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run deploy
```

## Troubleshooting

### Common Issues

**Extension not appearing:**
- Verify checkout extensibility is enabled on your store
- Check extension is activated in checkout settings

**Authentication errors:**
```bash
shopify auth logout
shopify auth login
```

**Build errors:**
- Ensure Node.js 16+ is installed
- Run `npm install` to reinstall dependencies

### Getting Help

- [Shopify CLI Documentation](https://shopify.dev/docs/apps/tools/cli)
- [Checkout UI Extensions](https://shopify.dev/docs/api/checkout-ui-extensions)
- [Shopify Community](https://community.shopify.com/)

## License

MIT
