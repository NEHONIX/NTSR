interface Config {
  name: string;
  version: string;
  features: string[];
}

enum Status {
  PENDING = "pending",
  RUNNING = "running", 
  COMPLETED = "completed"
} 

class Application {
  private config: Config;
  private status: Status = Status.PENDING;

  constructor(config: Config) {
    this.config = config;
  }

  start(): void {
    this.status = Status.RUNNING;
    console.log(`🚀 Starting ${this.config.name} v${this.config.version}`);
    console.log(`📋 Features: ${this.config.features.join(', ')}`);
    console.log(`📊 Status: ${this.status}`);
  }

  getInfo(): string {
    return `${this.config.name} v${this.config.version} (${this.status})`;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const appName = args[0] || 'NTSR Test App';
const appVersion = args[1] || '1.0.0';

const config: Config = {
  name: appName,
  version: appVersion,
  features: ['TypeScript Support', 'Fast Compilation', 'Zero Config']
};

const app = new Application(config);
app.start();

console.log(`\n✅ Application info: ${app.getInfo()}`);
console.log(`🎯 Arguments received: ${args.length > 0 ? args.join(' ') : 'none'}`);
console.log(`🎉 TypeScript execution successful!`);
