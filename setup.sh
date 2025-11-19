#!/bin/bash

echo "🛍️  Age Range Checkout Extension Setup"
echo "====================================="

# Check if we're in the project directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🔧 Next steps:"
echo "1. Go to your Shopify Partner Dashboard"
echo "2. Create a new app or use existing app"
echo "3. Copy the 'shopify app config link' command"
echo "4. Run that command in this directory"
echo "5. Update dev_store_url in shopify.app.toml"
echo "6. Run 'npm run dev' to start development"
echo ""
echo "📚 See README.md for detailed instructions"
