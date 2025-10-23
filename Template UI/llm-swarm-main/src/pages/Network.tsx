import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Users, HardDrive, Clock, Activity, Wifi, Download, Upload } from "lucide-react";
import { Link } from "react-router-dom";

const Network = () => {
  const seedingHours = 12.5;
  const requiredHours = 8;
  const connectedSeeders = 147;
  const uploadSpeed = 2.4;
  const downloadSpeed = 5.1;
  const modelProgress = 35;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Chat
            </Button>
          </Link>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Network Status</h1>
          <p className="text-muted-foreground">
            Monitor your contribution to the distributed LLM network
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Seeding Time
              </CardTitle>
              <CardDescription>
                {seedingHours >= requiredHours
                  ? "You've met the minimum requirement"
                  : "Keep seeding to maintain access"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current session</span>
                  <span className="font-semibold text-primary">
                    {seedingHours.toFixed(1)} hours
                  </span>
                </div>
                <Progress value={(seedingHours / requiredHours) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Minimum required: {requiredHours} hours
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Connected Seeders
              </CardTitle>
              <CardDescription>Active peers in the network</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-primary">
                  {connectedSeeders}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>Network health: Excellent</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Model Distribution
            </CardTitle>
            <CardDescription>
              You're currently seeding GPT-4 Distributed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Chunk 1-24 of 100</span>
                  <span className="text-primary font-semibold">{modelProgress}%</span>
                </div>
                <Progress value={modelProgress} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    Upload Speed
                  </div>
                  <div className="text-2xl font-semibold text-primary">
                    {uploadSpeed} MB/s
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Download className="h-4 w-4" />
                    Download Speed
                  </div>
                  <div className="text-2xl font-semibold text-primary">
                    {downloadSpeed} MB/s
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">BitTorrent for LLMs:</strong> Our network
              distributes AI models across multiple users, allowing anyone to access
              powerful models without expensive hardware.
            </p>
            <p>
              <strong className="text-foreground">Seeding Requirement:</strong> To use the
              chat, you must seed at least 8 hours. This ensures network stability and
              fair resource sharing.
            </p>
            <p>
              <strong className="text-foreground">Model Chunks:</strong> Each model is
              split into 100 chunks. You seed 24 chunks while other users seed the rest,
              collectively powering every inference request.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Network;
