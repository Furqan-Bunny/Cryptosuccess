# CryptoSuccess - AI-Powered Cryptocurrency Trading Signals

![CryptoSuccess Logo](public/logo.png)

CryptoSuccess is a modern web application that provides AI-generated cryptocurrency trading signals for popular coins like Ethereum (ETH), Solana (SOL), and Binance Coin (BNB). Built with Next.js, Firebase, and TensorFlow.js, it offers real-time market analysis and actionable trading recommendations.

## 🚀 Features

- **AI-Powered Signals**: Machine learning algorithms analyze market data to generate buy/sell/hold recommendations
- **Real-Time Market Data**: Live price feeds from Binance and CoinGecko APIs
- **Interactive Charts**: Beautiful, responsive charts with Chart.js and Recharts
- **Subscription Tiers**: Free and Pro plans with Stripe integration
- **Secure Authentication**: Firebase Auth with email/password and Google Sign-In
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Technical Indicators**: RSI, MACD, Moving Averages, and more

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Firebase CLI (`npm install -g firebase-tools`)
- Git
- A Firebase project
- Stripe account (for payments)
- Binance API key (optional, for premium data)

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Charts**: Chart.js, Recharts
- **State Management**: Zustand
- **Forms**: React Hook Form
- **Animations**: Framer Motion

### Backend
- **Platform**: Firebase (Firestore, Functions, Auth, Hosting)
- **Functions Runtime**: Node.js 18
- **Payment Processing**: Stripe
- **ML Framework**: TensorFlow.js

### DevOps
- **Type Checking**: TypeScript
- **Linting**: ESLint
- **Formatting**: Prettier
- **Testing**: Jest, React Testing Library
- **CI/CD**: GitHub Actions

## 🏗️ Project Structure

```
cryptosuccess/
├── docs/                  # BMad documentation
│   ├── prd.md            # Product Requirements
│   ├── architecture.md   # System Architecture
│   └── frontend-spec.md  # UI Specifications
├── functions/            # Firebase Cloud Functions
│   ├── src/
│   │   ├── auth/        # Authentication handlers
│   │   ├── market/      # Market data collectors
│   │   ├── signals/     # AI signal generation
│   │   ├── payments/    # Stripe integration
│   │   └── schedulers/  # Cron jobs
│   └── package.json
├── src/                  # Next.js application
│   ├── components/      # React components
│   ├── pages/          # Next.js pages
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API services
│   ├── utils/          # Utilities
│   └── types/          # TypeScript types
├── public/             # Static assets
├── tests/              # Test suites
└── package.json        # Root dependencies
```

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/cryptosuccess.git
cd cryptosuccess
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Environment Variables
Copy the example environment file and fill in your values:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Firebase and Stripe credentials:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
# ... etc
```

### 4. Set Up Firebase

#### Initialize Firebase
```bash
firebase login
firebase init
```

Select:
- Firestore
- Functions
- Hosting
- Emulators

#### Deploy Security Rules
```bash
firebase deploy --only firestore:rules
```

#### Deploy Indexes
```bash
firebase deploy --only firestore:indexes
```

### 5. Set Up Functions Environment
```bash
cd functions
npm install
firebase functions:config:set stripe.secret="sk_test_your_secret_key"
firebase functions:config:set binance.api_key="your_api_key"
firebase functions:config:set binance.secret_key="your_secret_key"
cd ..
```

### 6. Run Development Server
```bash
# Start Firebase emulators
npm run firebase:emulators

# In another terminal, start Next.js
npm run dev
```

Visit http://localhost:3000 to see the application.

## 📝 Available Scripts

### Development
- `npm run dev` - Start Next.js development server
- `npm run firebase:emulators` - Start Firebase emulators
- `npm run functions:serve` - Test functions locally

### Build & Deploy
- `npm run build` - Build production bundle
- `npm run firebase:deploy` - Deploy to Firebase
- `npm run functions:deploy` - Deploy functions only

### Testing & Quality
- `npm test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run type-check` - Check TypeScript types
- `npm run format` - Format code with Prettier

## 🔧 Configuration

### Firebase Setup
1. Create a new Firebase project at https://console.firebase.google.com
2. Enable Authentication (Email/Password and Google)
3. Create a Firestore database
4. Set up Firebase Hosting
5. Configure project in `firebase.json`

### Stripe Setup
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the dashboard
3. Create products and prices for subscription tiers
4. Set up webhook endpoint for `/api/stripe/webhook`

### API Configuration
1. **Binance API** (Optional for premium features):
   - Register at https://www.binance.com/en/my/settings/api-management
   - Create API key with read-only permissions

2. **CoinGecko API** (Free tier available):
   - Get API key from https://www.coingecko.com/en/api

## 📊 Data Flow

### Signal Generation Process
1. **Data Collection**: Market data fetched every minute from exchanges
2. **Technical Analysis**: Calculate indicators (RSI, MACD, MA)
3. **AI Prediction**: TensorFlow model analyzes patterns
4. **Signal Creation**: Generate buy/sell/hold with confidence score
5. **Real-time Updates**: Push to connected clients via Firestore

### Subscription Flow
1. User selects plan on pricing page
2. Redirect to Stripe Checkout
3. Payment processed by Stripe
4. Webhook updates user subscription in Firestore
5. UI reflects new subscription status

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

## 🚢 Deployment

### Production Deployment
1. Build the Next.js app:
   ```bash
   npm run build
   ```

2. Deploy to Firebase:
   ```bash
   npm run firebase:deploy
   ```

3. Verify deployment:
   - Check hosting URL
   - Test authentication flow
   - Verify payment processing
   - Monitor function logs

### Environment-Specific Deployments
- **Staging**: `firebase use staging && firebase deploy`
- **Production**: `firebase use production && firebase deploy`

## 📈 Performance Optimization

- **Code Splitting**: Dynamic imports for route-based splitting
- **Image Optimization**: Next.js Image component with lazy loading
- **Caching**: Firebase Firestore offline persistence
- **CDN**: Static assets served via Firebase Hosting CDN
- **API Rate Limiting**: Implemented in Cloud Functions

## 🔒 Security Considerations

- **Authentication**: Firebase Auth with secure session management
- **Authorization**: Firestore security rules enforce access control
- **Data Encryption**: HTTPS everywhere, sensitive data encrypted
- **API Keys**: Stored securely in environment variables
- **Input Validation**: Server-side validation on all endpoints
- **Rate Limiting**: Prevent abuse of API endpoints

## 🐛 Troubleshooting

### Common Issues

1. **Firebase emulators not starting**:
   ```bash
   firebase emulators:start --import=./emulator-data --export-on-exit
   ```

2. **TypeScript errors**:
   ```bash
   npm run type-check
   ```

3. **Stripe webhook failures**:
   - Verify webhook secret is correct
   - Check function logs: `firebase functions:log`

4. **Build failures**:
   - Clear cache: `rm -rf .next node_modules`
   - Reinstall: `npm install`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Firebase](https://firebase.google.com/) for the backend infrastructure
- [Stripe](https://stripe.com/) for payment processing
- [Binance](https://www.binance.com/) for market data
- [TensorFlow](https://www.tensorflow.org/) for machine learning
- [Vercel](https://vercel.com/) for Next.js framework

## 📞 Support

- Documentation: See `/docs` folder
- Issues: [GitHub Issues](https://github.com/yourusername/cryptosuccess/issues)
- Email: support@cryptosuccess.com

---

Built with ❤️ using the BMad Method