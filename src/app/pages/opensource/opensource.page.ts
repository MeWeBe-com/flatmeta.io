import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { SessionService } from 'src/app/providers/session.service';

export interface CodeProposal {
  id: string;
  fileName: string;
  title: string;
  author: string;
  code: string;
  votes: number;
  votedByMe: boolean;
  status: string;
  createdAt: string;
}

@Component({
    selector: 'app-opensource',
    templateUrl: './opensource.page.html',
    styleUrls: ['./opensource.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule, FormsModule, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar],
})
export class OpensourcePage implements OnInit {
  selectedTemplateKey: string = 'land-widget.js';
  customFileName: string = 'land-interactive-widget.js';
  proposalTitle: string = '';
  editorCode: string = '';

  templates: Record<string, { fileName: string; title: string; code: string }> = {
    'land-widget.js': {
      fileName: 'land-interactive-widget.js',
      title: 'Interactive Land Mini-Game & Visitor Counter',
      code: `// FlatMeta Interactive Land Script (runs inside owned square area)
export function onCitizenEnterTile(citizen, tileArea) {
  tileArea.incrementVisitors();
  tileArea.showBanner(\`Welcome @\${citizen.username} to \${tileArea.title}!\`);
  return {
    expression: 'Smile',
    rewardPoints: 10
  };
}`,
    },
    'clan-battle.js': {
      fileName: 'clan-territory-challenge.js',
      title: 'Clan Alliance & Territory Challenge Mini-Game',
      code: `// FlatMeta Clan & Territory Challenge Module
export function challengeNeighbourTile(challenger, defender, squareCoords) {
  const rollA = Math.floor(Math.random() * 100) + challenger.clanBonus;
  const rollB = Math.floor(Math.random() * 100) + defender.defenseWallBonus;
  return {
    winner: rollA >= rollB ? challenger.username : defender.username,
    coords: squareCoords
  };
}`,
    },
    'avatar-pack.ts': {
      fileName: 'avatar-expressions-pack.ts',
      title: 'Smiley-to-Avatar Expression Pack',
      code: `// FlatMeta Smiley Auto-Expression Mapper
export const SMILEY_EXPRESSIONS: Record<string, string> = {
  ':)': 'Smile',
  ':D': 'Twinkle',
  ';)': 'Wink',
  '<3': 'Hearts',
  'B)': 'Cool'
};`,
    },
  };

  roadmapFeatures = [
    { title: 'Your own HTML/JS on your land', status: 'Live', desc: 'Owners can add sandboxed HTML/JS or embed a page that visitors see when they open the land.' },
    { title: 'One image across many squares', status: 'Live', desc: 'Select a block of your squares and stretch one picture or GIF across all of them, edge to edge.' },
    { title: 'Custom land links & 3-word addresses', status: 'Live', desc: 'Give land a link like flatmeta.io/u/your-name and a 3-word address people can search for.' },
    { title: 'Clans, territory & mini-games', status: 'Open for contributions', desc: 'Neighbour alliances, property walls and challenges on the grid. Clans exist; the games are waiting for you.' },
    { title: 'Paint tools on land', status: 'Open for contributions', desc: 'Draw markers, lines, shapes and text boxes on top of your squares.' },
    { title: 'Replay past scenarios', status: 'Idea', desc: 'Record and play back events that happened on the map.' },
  ];

  proposals: CodeProposal[] = [];
  private voted = new Set<string>();

  constructor(public general: GeneralService, public session: SessionService, public http: HttpService) {
    try {
      this.voted = new Set(JSON.parse(localStorage.getItem('flatmeta_votes_v1') || '[]'));
    } catch {}
  }

  ngOnInit() {
    this.loadTemplate('land-widget.js');
    this.loadProposals();
  }

  loadTemplate(key: string) {
    this.selectedTemplateKey = key;
    const tpl = this.templates[key];
    if (tpl) {
      this.customFileName = tpl.fileName;
      this.proposalTitle = tpl.title;
      this.editorCode = tpl.code;
    }
  }

  onFileUpload(ev: any) {
    const file: File | undefined = ev?.target?.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      this.general.presentToast('Files must be 200 KB or smaller.');
      return;
    }
    this.customFileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.editorCode = String(reader.result || '');
      this.general.presentToast(`Loaded "${file.name}".`);
    };
    reader.readAsText(file);
  }

  async loadProposals() {
    const res = await this.http.getAsync('CommunityProposals');
    if (res?.status === true && Array.isArray(res.data?.proposals)) {
      this.proposals = res.data.proposals.map((bp: any) => this.fromApi(bp));
    }
  }

  async submitProposal() {
    if (this.session.isGuest) {
      this.session.requestAuth('Verify your email to submit code to the community.');
      return;
    }
    if (!this.editorCode.trim()) {
      this.general.presentToast('Write or upload some code first.');
      return;
    }
    const res = await this.http.postAsync('SubmitCommunityProposal', {
      title: (this.proposalTitle || 'Community feature').trim().slice(0, 150),
      category: (this.customFileName || 'module.js').trim().slice(0, 80),
      description: this.proposalTitle.trim().slice(0, 500),
      codeSnippet: this.editorCode.slice(0, 20000),
    });
    if (res?.status === true) {
      this.voted.add(String(res.data?.proposal?.id));
      this.saveVotes();
      if (Array.isArray(res.data?.proposals)) this.proposals = res.data.proposals.map((bp: any) => this.fromApi(bp));
      this.general.presentToast('Submitted. When the community votes it up, an admin reviews it for the live site.');
    } else {
      this.general.presentToast(res?.data?.message || res?.message || 'Could not submit.');
    }
  }

  async toggleVote(p: CodeProposal) {
    if (this.session.isGuest) {
      this.session.requestAuth('Verify your email to vote.');
      return;
    }
    // 1 = vote, 0 = take my vote back (the server keeps one vote per person).
    const delta = p.votedByMe ? 0 : 1;
    const res = await this.http.postAsync('VoteCommunityProposal', { id: p.id, delta });
    if (res?.status === true) {
      delta > 0 ? this.voted.add(p.id) : this.voted.delete(p.id);
      this.saveVotes();
      if (Array.isArray(res.data?.proposals)) this.proposals = res.data.proposals.map((bp: any) => this.fromApi(bp));
    } else {
      this.general.presentToast(res?.data?.message || res?.message || 'Could not record your vote.');
    }
  }

  private fromApi(bp: any): CodeProposal {
    return {
      id: String(bp.id),
      fileName: String(bp.category || 'module.js'),
      title: String(bp.title || 'Untitled'),
      author: String(bp.author || 'citizen'),
      code: String(bp.codeSnippet || bp.description || ''),
      votes: Number(bp.votes || 0),
      votedByMe: this.voted.has(String(bp.id)),
      status: String(bp.status || 'Voting'),
      createdAt: String(bp.created_at || '').slice(0, 10),
    };
  }

  private saveVotes() {
    try {
      localStorage.setItem('flatmeta_votes_v1', JSON.stringify(Array.from(this.voted)));
    } catch {}
  }
}
