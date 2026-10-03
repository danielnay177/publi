import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Speech from 'expo-speech';
import { auth, initializeFirebaseServices } from './firebase';
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut, updateProfile } from '@react-native-firebase/auth';
import { analyzeRecording, generateStoryOutline } from './aiService';
import { subscribeDrafts, saveDraft as saveCloudDraft, deleteDraft, subscribeRecordings, subscribeVoiceStories, createVoiceStory, updateVoiceStory, deleteVoiceStory, applySuggestedVoiceStoryTitle, adoptRecordingAsVoiceStory, saveRecording, updateRecording, deleteRecording, downloadRecordingForAnalysis, saveProfile as saveCloudProfile, subscribeProfile, saveBookmarks, subscribeBookmarks, migrateLocalData, deleteCloudAccountData } from './cloudData';
import DraftVoiceExperience, { TopicIdeas } from './DraftVoiceExperience';
import DraftHomePrototype from './DraftHomePrototype';

// Low-glare, warm charcoal palette for long writing sessions.
const C = { bg: '#171C1B', paper: '#222927', ink: '#E7E8E1', muted: '#A7AEA7', line: '#39433E', green: '#91B69F', greenSoft: '#2C3C34', rust: '#D28A70', gold: '#D3B16C', cream: '#34352F', white: '#F5F3EC' };
const APP_VERSION = '1.0.0';
const LEGAL_COPY = {
  'Terms of Service': [
    ['Using Publi', 'Publi is a writing workspace for exploring ideas, organizing research, and preparing stories. You must be at least 13 years old to use the app. You are responsible for your writing, how you use information from external sources, and anything you choose to submit or publish.'],
    ['Your content', 'You keep ownership of the writing you create. Publi does not claim ownership of your drafts. Drafts, voice recordings, profile details, and saved publications are synced to your Firebase account.'],
    ['Accounts', 'Keep your sign-in details secure. You may use an email account or an anonymous guest account. Guest accounts are tied to the current installation and may be difficult to recover if you lose access to the device. You can sign out or request account deletion in your profile.'],
    ['Acceptable use', 'Do not use Publi to break the law, infringe others’ rights, distribute malware, or interfere with the app or its users. External publications and resources are operated by third parties and have their own terms and editorial policies.'],
    ['Availability and liability', 'Publi is provided as-is while it is developed. Features may change, and we cannot guarantee uninterrupted access or that external links remain available. To the extent allowed by law, Publi is not liable for indirect or consequential loss arising from use of the app. Nothing in these terms limits rights that cannot legally be limited.'],
    ['Contact and updates', 'These terms may be updated as Publi develops. Continued use after an update means you accept the revised terms. The publisher’s support contact should be added here before public release.'],
  ],
  'Privacy Policy': [
    ['What Publi stores', 'Firebase Authentication processes your email address, account identifier, and display name. Cloud Firestore stores drafts, transcripts, AI suggestions, profile details, and saved publications. Cloud Storage stores voice recordings in your account.'],
    ['Firebase', 'Authentication is provided by Google Firebase. Firebase receives information needed to create and maintain your account and protect the service. Review Google’s privacy information at policies.google.com/privacy. Publi does not use advertising or analytics in this release.'],
    ['External links and recordings', 'Research and publication links open third-party websites. When you finish a voice note, Publi uploads it to Firebase Storage and sends its audio and story context through Firebase AI Logic to Gemini for transcription, polishing, and follow-up questions. Ask publi saves your chats, voice messages, and attached photos in your Firebase account and sends questions and attachments to Gemini for answers. A working title is sent to Gemini to suggest an outline. AI output can be inaccurate; review it before using it.'],
    ['Retention and deletion', 'You can delete your Firebase account from the profile screen. Account deletion removes your drafts, recordings, chats, attached photos, transcripts, suggestions, profile, and bookmarks from Firebase before removing the account.'],
    ['Children, security, and changes', 'Publi is not designed for children under 13. We use Firebase Authentication and App Check to protect the service, but no method of storage or transmission is completely secure. We will update this policy when the app’s data practices change.'],
    ['Contact', 'For privacy questions, use the publisher’s support contact shown in the App Store listing. This policy is effective September 29, 2026.'],
  ],
  'About Publi': [
    ['A place for your voice.', 'Publi helps people turn lived experience, ideas, and questions into stories ready for a wider conversation. Start with a first line, explore reporting and publication resources, and shape a pitch at your own pace.'],
    ['Made for the stories that matter', 'Use Drafts to capture and revise ideas, Research to explore publications, Coach to find writing and reporting resources, and Pitch to prepare for a submission. Publi does not publish or submit your work for you.'],
    ['Version', `Publi ${APP_VERSION}\nSupport details will be listed in the App Store.`],
  ],
};
const TABS = [
  { id: 'Home', icon: 'home-outline', active: 'home' },
  { id: 'Research', icon: 'search-outline', active: 'search' },
  { id: 'Draft', icon: 'create-outline', active: 'create' },
  { id: 'Coach', icon: 'chatbubbles-outline', active: 'chatbubbles' },
  { id: 'Pitch', icon: 'paper-plane-outline', active: 'paper-plane' },
];
const LINKS = [
  { name: 'ABC News', area: 'News · United States & world', url: 'https://abcnews.com/', color: '#426B70', mark: 'ABC' },
  { name: 'ACLED', area: 'Conflict · Data & analysis', url: 'https://acleddata.com/', color: '#4D6474', mark: 'ACLED' },
  { name: 'Amnesty International', area: 'Human rights', url: 'https://www.amnesty.org/en/', color: '#6B5268', mark: 'AI' },
  { name: 'Asia Times', area: 'News · Asia', url: 'https://asiatimes.com/', color: '#536B59', mark: 'AT' },
  { name: 'Assistance Association for Political Prisoners', area: 'Human rights · Myanmar', url: 'https://aappb.org/', color: '#52665B', mark: 'AAPP' },
  { name: 'Associated Press', area: 'News · Global reporting', url: 'https://apnews.com/', color: '#426B70', mark: 'AP' },
  { name: 'Bangkok Post', area: 'News · Thailand', url: 'https://www.bangkokpost.com/', color: '#52665B', mark: 'BP' },
  { name: 'BBC News', area: 'News · Global', url: 'https://www.bbc.com/news', color: '#52665B', mark: 'BBC' },
  { name: 'Bloomberg', area: 'Business · Markets · World', url: 'https://www.bloomberg.com/', color: '#4D6474', mark: 'BL' },
  { name: 'The Boston Globe', area: 'News · United States', url: 'https://www.bostonglobe.com/', color: '#685D48', mark: 'BG' },
  { name: 'Brookings', area: 'Policy research', url: 'https://www.brookings.edu/', color: '#685D48', mark: 'B' },
  { name: 'Carnegie Council', area: 'Ethics · International affairs', url: 'https://www.carnegiecouncil.org/', color: '#4D6474', mark: 'CC' },
  { name: 'Carnegie Endowment', area: 'Global policy research', url: 'https://carnegieendowment.org/', color: '#52665B', mark: 'CE' },
  { name: 'Chicago Tribune', area: 'News · United States', url: 'https://www.chicagotribune.com/', color: '#426B70', mark: 'CT' },
  { name: 'The Chosun Daily', area: 'News · Korea', url: 'https://www.chosun.com/english/', color: '#6B5268', mark: 'CD' },
  { name: 'CNN', area: 'News · United States & world', url: 'https://www.cnn.com/', color: '#6B5268', mark: 'CNN' },
  { name: 'Columbia Journalism Review', area: 'Journalism · Media criticism', url: 'https://www.cjr.org/', color: '#4D6474', mark: 'CJR' },
  { name: 'Council on Foreign Relations', area: 'International affairs', url: 'https://www.cfr.org/', color: '#536B59', mark: 'CFR' },
  { name: 'CSIS', area: 'Security · Policy research', url: 'https://www.csis.org/', color: '#685D48', mark: 'CSIS' },
  { name: 'Dawei Watch', area: 'News · Myanmar', url: 'https://www.daweiwatch.com/', color: '#52665B', mark: 'DW' },
  { name: 'Democratic Voice of Burma', area: 'News · Myanmar', url: 'https://english.dvb.no/', color: '#4D6474', mark: 'DVB' },
  { name: 'The Diplomat', area: 'Asia-Pacific affairs', url: 'https://thediplomat.com/', color: '#536B59', mark: 'D' },
  { name: 'DW', area: 'News · Global', url: 'https://www.dw.com/en/top-stories/s-9097', color: '#536B59', mark: 'DW' },
  { name: 'The Economist', area: 'News · Global analysis', url: 'https://www.economist.com/', color: '#6B5268', mark: 'E' },
  { name: 'Financial Times', area: 'News · Business & world', url: 'https://www.ft.com/', color: '#426B70', mark: 'FT' },
  { name: 'Forbes', area: 'Business · Ideas & leadership', url: 'https://www.forbes.com/', color: '#52665B', mark: 'F' },
  { name: 'Foreign Affairs', area: 'International affairs · Analysis', url: 'https://www.foreignaffairs.com/', color: '#536B59', mark: 'FA' },
  { name: 'Foreign Policy', area: 'International affairs', url: 'https://foreignpolicy.com/', color: '#6B5268', mark: 'FP' },
  { name: 'Freedom House', area: 'Democracy · Human rights', url: 'https://freedomhouse.org/', color: '#52665B', mark: 'FH' },
  { name: 'Frontier Myanmar', area: 'News · Myanmar', url: 'https://www.frontiermyanmar.net/en/', color: '#536B59', mark: 'FM' },
  { name: 'Fulcrum', area: 'Analysis · Southeast Asia', url: 'https://fulcrum.sg/', color: '#536B59', mark: 'F' },
  { name: 'Human Rights Watch', area: 'Human rights', url: 'https://www.hrw.org/', color: '#426B70', mark: 'HRW' },
  { name: 'Insight Myanmar', area: 'Podcast · Myanmar', url: 'https://insightmyanmar.org/', color: '#6B5268', mark: 'IM' },
  { name: 'Institute for Strategy and Policy – Myanmar', area: 'Policy research · Myanmar', url: 'https://ispmyanmar.com/', color: '#6B5268', mark: 'ISP' },
  { name: 'International Crisis Group', area: 'Conflict · Policy analysis', url: 'https://www.crisisgroup.org/', color: '#4D6474', mark: 'ICG' },
  { name: 'The Irrawaddy', area: 'News · Myanmar', url: 'https://www.irrawaddy.com/', color: '#685D48', mark: 'IR' },
  { name: 'ISEAS Publishing Bookshop', area: 'Books · Southeast Asia', url: 'https://bookshop.iseas.edu.sg/', color: '#536B59', mark: 'ISEAS' },
  { name: 'ISEAS – Yusof Ishak Institute', area: 'Southeast Asia research', url: 'https://www.iseas.edu.sg/', color: '#426B70', mark: 'ISEAS' },
  { name: 'The Japan News', area: 'News · Japan', url: 'https://japannews.yomiuri.co.jp/', color: '#426B70', mark: 'JN' },
  { name: 'Los Angeles Times', area: 'News · United States', url: 'https://www.latimes.com/', color: '#52665B', mark: 'LAT' },
  { name: 'Mizzima', area: 'News · Myanmar', url: 'https://eng.mizzima.com/', color: '#6B5268', mark: 'MZ' },
  { name: 'MS NOW', area: 'News · United States & world', url: 'https://www.ms.now/', color: '#4D6474', mark: 'MS' },
  { name: 'Mutual Aid Myanmar', area: 'Community action · Myanmar', url: 'https://www.mutualaidmyanmar.org/whats-happening', color: '#4D6474', mark: 'MAM' },
  { name: 'Myanmar Now', area: 'News · Myanmar', url: 'https://myanmar-now.org/en/', color: '#4D6474', mark: 'MN' },
  { name: 'The Nation', area: 'Politics · Culture · Opinion', url: 'https://www.thenation.com/', color: '#685D48', mark: 'N' },
  { name: 'The New Humanitarian', area: 'Humanitarian reporting', url: 'https://www.thenewhumanitarian.org/', color: '#426B70', mark: 'TNH' },
  { name: 'The New York Times', area: 'News · United States & world', url: 'https://www.nytimes.com/', color: '#52665B', mark: 'NYT' },
  { name: 'Nikkei Asia', area: 'News · Asia', url: 'https://asia.nikkei.com/', color: '#4D6474', mark: 'NA' },
  { name: 'NPR', area: 'News · Culture & ideas', url: 'https://www.npr.org/', color: '#6B5268', mark: 'NPR' },
  { name: 'POLITICO', area: 'Politics · Policy', url: 'https://www.politico.com/', color: '#685D48', mark: 'P' },
  { name: 'Pulitzer Center', area: 'Journalism · Reporting grants', url: 'https://pulitzercenter.org/', color: '#52665B', mark: 'PC' },
  { name: 'Radio Free Asia (Burmese)', area: 'News · Myanmar', url: 'https://www.rfa.org/burmese/', color: '#4D6474', mark: 'RFA' },
  { name: 'Regional Center for Social Science and Sustainable Development', area: 'Research · Southeast Asia', url: 'https://rcsd.soc.cmu.ac.th/news-events/', color: '#426B70', mark: 'RCSD' },
  { name: 'Reuters', area: 'News · Global reporting', url: 'https://www.reuters.com/', color: '#685D48', mark: 'R' },
  { name: 'South China Morning Post', area: 'News · Asia', url: 'https://www.scmp.com/', color: '#52665B', mark: 'SCMP' },
  { name: 'Southeast Asia Peace Institute', area: 'Policy research · Peacebuilding', url: 'https://www.seapi.org/', color: '#4D6474', mark: 'SEAPI' },
  { name: 'Stimson Center', area: 'Security · Policy research', url: 'https://www.stimson.org/', color: '#536B59', mark: 'SC' },
  { name: 'The Straits Times', area: 'News · Global', url: 'https://www.straitstimes.com/global', color: '#536B59', mark: 'ST' },
  { name: 'Tea Circle Myanmar', area: 'Research · Myanmar', url: 'https://teacirclemyanmar.com/', color: '#426B70', mark: 'TCM' },
  { name: 'The Telegraph', area: 'News · United States', url: 'https://www.telegraph.co.uk/us/', color: '#4D6474', mark: 'T' },
  { name: 'TIME', area: 'News · World & ideas', url: 'https://time.com/', color: '#4D6474', mark: 'TIME' },
  { name: 'Times of India', area: 'News · United States', url: 'https://timesofindia.indiatimes.com/us', color: '#685D48', mark: 'TOI' },
  { name: 'USA Today', area: 'News · United States', url: 'https://www.usatoday.com/', color: '#536B59', mark: 'USA' },
  { name: 'Voice of America', area: 'News · Global', url: 'https://www.voanews.com/', color: '#426B70', mark: 'VOA' },
  { name: 'The Wall Street Journal', area: 'News · Business & world', url: 'https://www.wsj.com/', color: '#6B5268', mark: 'WSJ' },
  { name: 'The Washington Post', area: 'News · United States & world', url: 'https://www.washingtonpost.com/', color: '#4D6474', mark: 'WP' },
];
const PITCH_DESTINATIONS = {
  'ABC News': 'https://abcnews.go.com/Site/page?id=3068843',
  'ACLED': 'https://acleddata.com/contact/',
  'Amnesty International': 'https://www.amnesty.org/en/about-us/contact/',
  'Assistance Association for Political Prisoners': 'https://aappb.org/contact/',
  'Associated Press': 'https://www.ap.org/contact-us/',
  'Bangkok Post': 'https://www.bangkokpost.com/opinion/postbag',
  'BBC News': 'https://help.bbc.com/hc/en-us/articles/52273405959443-How-can-I-send-a-story-or-contribute-to-BBC-News',
  'Bloomberg': 'https://www.bloomberg.com/help/question/submit-feedback-news-coverage/',
  'The Boston Globe': 'https://www.bostonglobe.com/2019/12/26/opinion/submit-an-op-ed/',
  'Brookings': 'https://www.brookings.edu/contact/',
  'Carnegie Council': 'https://www.carnegiecouncil.org/about/contact',
  'Carnegie Endowment': 'https://carnegieendowment.org/about/contact-us',
  'Chicago Tribune': 'https://www.chicagotribune.com/contact-us/',
  'The Chosun Daily': 'https://www.chosun.com/customer/',
  'CNN': 'https://help.cnn.com/us/feedback',
  'Council on Foreign Relations': 'https://www.cfr.org/about/contact-us',
  'CSIS': 'https://www.csis.org/about/contact',
  'Dawei Watch': 'https://www.daweiwatch.com/contact/',
  'Democratic Voice of Burma': 'https://english.dvb.no/contact/',
  'The Diplomat': 'https://thediplomat.com/write-for-us/',
  'DW': 'https://www.dw.com/en/contact/s-30606',
  'The Economist': 'https://www.economist.com/contact-us',
  'Financial Times': 'https://www.ft.com/contact-us',
  'Forbes': 'https://www.forbes.com/contact/',
  'Foreign Policy': 'https://help.foreignpolicy.com/hc/en-us/articles/11732721893020-Submit-an-essay',
  'Freedom House': 'https://freedomhouse.org/contact-us',
  'Frontier Myanmar': 'https://www.frontiermyanmar.net/en/contact/',
  'Human Rights Watch': 'https://www.hrw.org/contact-us',
  'Institute for Strategy and Policy – Myanmar': 'https://ispmyanmar.com/contact/',
  'International Crisis Group': 'https://www.crisisgroup.org/contact-us',
  'The Irrawaddy': 'https://www.irrawaddy.com/contact-us',
  'ISEAS – Yusof Ishak Institute': 'https://www.iseas.edu.sg/contact-us/',
  'The Japan News': 'https://japannews.yomiuri.co.jp/contact/',
  'Los Angeles Times': 'https://www.latimes.com/oe-howtosubmitoped-story.html',
  'Mizzima': 'https://eng.mizzima.com/contact-us/',
  'MS NOW': 'https://www.ms.now/contact/',
  'The New York Times': 'https://help.nytimes.com/hc/en-us/articles/115015385887-How-to-contact-The-New-York-Times',
  'Nikkei Asia': 'https://asia.nikkei.com/Contact-us',
  'NPR': 'https://help.npr.org/contact/s/',
  'POLITICO': 'https://www.politico.com/contact-us',
  'Reuters': 'https://www.reuters.com/info-pages/contact-us/',
  'South China Morning Post': 'https://www.scmp.com/contact-us',
  'Stimson Center': 'https://www.stimson.org/contact-us/',
  'The Straits Times': 'https://www.straitstimes.com/contact-us',
  'Tea Circle Myanmar': 'https://teacirclemyanmar.com/contact/',
  'The Telegraph': 'https://www.telegraph.co.uk/contact-us/',
  'TIME': 'https://time.com/letters/',
  'Times of India': 'https://timesofindia.indiatimes.com/contactus',
  'USA Today': 'https://www.usatoday.com/contact/',
  'The Wall Street Journal': 'https://www.wsj.com/tips',
  'The Washington Post': 'https://helpcenter.washingtonpost.com/hc/en-us/articles/115003675788-Submit-an-op-ed',
  'Fulcrum': 'https://fulcrum.sg/submission-guidelines/',
  'Southeast Asia Peace Institute': 'https://www.seapi.org/contact',
  'ISEAS Publishing Bookshop': 'https://bookshop.iseas.edu.sg/contacts',
  'Mutual Aid Myanmar': 'https://www.mutualaidmyanmar.org/contact',
  'Regional Center for Social Science and Sustainable Development': 'https://rcsd.soc.cmu.ac.th/contact/',
  'Asia Times': 'https://asiatimes.com/write-for-us/',
  'Myanmar Now': 'https://myanmar-now.org/mm/contact-us/',
  'Foreign Affairs': 'https://www.foreignaffairs.com/about-us',
  'Radio Free Asia (Burmese)': 'https://www.rfa.org/english/send_news_form/',
  'Voice of America': 'https://www.voanews.com/contact-us',
  'The Nation': 'https://www.thenation.com/freelancer-agreement/',
  'Pulitzer Center': 'https://pulitzercenter.org/applying-reporting-grant-frequently-asked-questions',
  'Insight Myanmar': 'https://insightmyanmar.org/suggest-a-guest',
  'Columbia Journalism Review': 'https://www.cjr.org/about_us/submission-guidelines.php',
  'The New Humanitarian': 'https://www.thenewhumanitarian.org/investigations/pitch',
};
const PITCH_LINKS = LINKS.map(item => ({
  ...item,
  logoDomain: item.url,
  url: PITCH_DESTINATIONS[item.name] || item.url,
  area: 'Submissions · Editorial contact',
}));

const GENRES = [
  { name: 'Personal essay', type: 'FIRST PERSON', desc: 'A lived experience that reveals something larger.', icon: 'person-outline', color: '#39332D' },
  { name: 'Op-ed', type: 'ARGUMENT', desc: 'A clear point of view, grounded in evidence.', icon: 'megaphone-outline', color: '#2C3C34' },
  { name: 'Reported feature', type: 'NARRATIVE', desc: 'Characters, scenes and careful reporting.', icon: 'newspaper-outline', color: '#39362F' },
  { name: 'Commentary', type: 'ANALYSIS', desc: 'Context and insight on an issue in the news.', icon: 'chatbox-ellipses-outline', color: '#30383A' },
  { name: 'Memoir', type: 'LONGFORM', desc: 'A story from your life with a shape and a why.', icon: 'book-outline', color: '#39332D' },
  { name: 'Letters & local voices', type: 'COMMUNITY', desc: 'A concise voice rooted in a place or moment.', icon: 'mail-outline', color: '#2C3C34' },
];
const INSPIRATION = [
  { title: 'Spotlight', kind: 'FILM · 2015', detail: 'Boston Globe reporters uncover a decades-long abuse cover-up. A reminder that patient reporting can change public understanding.', icon: 'videocam-outline', tint: '#39332D', preview: 'https://img.youtube.com/vi/yXymzwz0V2g/hqdefault.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=yXymzwz0V2g' },
  { title: 'Freedom Writers', kind: 'FILM · 2007', detail: 'A teacher invites students in a divided school to write honestly about their lives. Their journals become a bridge to one another.', icon: 'film-outline', tint: '#2C3C34', preview: 'https://img.youtube.com/vi/JhXMJlm852A/hqdefault.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=JhXMJlm852A' },
  { title: 'The Moth', kind: 'PODCAST · STORYTELLING', detail: 'True stories told by the people who lived them.', icon: 'mic-outline', tint: '#39362F', action: 'Explore stories', url: 'https://themoth.org/stories' },
  { title: 'On Writing Well', kind: 'BOOK · WILLIAM ZINSSER', detail: 'A warm, practical case for clarity and the writer’s voice.', icon: 'book-outline', tint: '#30383A', cover: 'https://covers.openlibrary.org/b/isbn/9780060891541-L.jpg', action: 'Explore the book', url: 'https://openlibrary.org/isbn/9780060891541' },
  { title: 'Hidden Figures', kind: 'FILM · 2016', detail: 'Katherine Johnson, Dorothy Vaughan, and Mary Jackson bring their brilliance to NASA despite the barriers around them.', icon: 'film-outline', tint: '#39332D', preview: 'https://img.youtube.com/vi/5wfrDhgUMGI/hqdefault.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=5wfrDhgUMGI' },
  { title: 'Just Mercy', kind: 'BOOK · BRYAN STEVENSON', detail: 'A lawyer’s account of confronting injustice and insisting on human dignity.', icon: 'book-outline', tint: '#2C3C34', cover: 'https://covers.openlibrary.org/b/isbn/9780812984965-L.jpg', action: 'Explore the book', url: 'https://openlibrary.org/isbn/9780812984965' },
  { title: 'When They See Us', kind: 'TV · 2019', detail: 'Ava DuVernay’s limited series follows the lives of five teenagers and their families after a wrongful conviction.', icon: 'tv-outline', tint: '#39362F', preview: 'https://www.dramaqueen.com.tw/images/video_poster/2019/201905031814402536cac4e77b3c7cfeb5f79d50d1f7942cab.jpg', action: 'Explore on Netflix', url: 'https://www.netflix.com/title/80200549' },
  { title: 'The Hate U Give', kind: 'BOOK · ANGIE THOMAS', detail: 'A young woman finds her voice after witnessing a life-changing event.', icon: 'book-outline', tint: '#30383A', cover: 'https://covers.openlibrary.org/b/isbn/9780062498533-L.jpg', action: 'Explore the book', url: 'https://openlibrary.org/isbn/9780062498533' },
  { title: 'The Pursuit of Happyness', kind: 'FILM · 2006', detail: 'Inspired by Chris Gardner’s life, this story follows a father and son through homelessness and an improbable new beginning.', icon: 'film-outline', tint: '#39332D', preview: 'https://image11.m1905.cn/uploadfile/2008/0911/103914337.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=_ogkBiqPONA' },
  { title: 'Between the World and Me', kind: 'BOOK · TA-NEHISI COATES', detail: 'A deeply personal letter exploring identity, history, and inheritance.', icon: 'book-outline', tint: '#2C3C34', cover: 'https://covers.openlibrary.org/b/isbn/9780812993547-L.jpg', action: 'Explore the book', url: 'https://openlibrary.org/isbn/9780812993547' },
  { title: 'Abbott Elementary', kind: 'TV · 2021–', detail: 'A mockumentary comedy about dedicated teachers building community and possibility in an underfunded Philadelphia school.', icon: 'tv-outline', tint: '#39362F', preview: 'https://www.kinonews.ru/insimgs/2025/poster/poster136465_1.webp', action: 'Explore on ABC', url: 'https://abc.com/shows/abbott-elementary' },
  { title: 'The Post', kind: 'FILM · 2017', detail: 'Publisher Katharine Graham and editor Ben Bradlee risk everything to publish a government secret. A story about press freedom and the people behind the bylines.', icon: 'film-outline', tint: '#30383A', preview: 'https://img.youtube.com/vi/nrXlY6gzTTM/hqdefault.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=nrXlY6gzTTM' },
  { title: 'NYAD', kind: 'FILM · 2023', detail: 'At 60, marathon swimmer Diana Nyad pursues the open-water crossing she has dreamed about for decades, with her closest friend by her side.', icon: 'film-outline', tint: '#39332D', preview: 'https://img.youtube.com/vi/3anCgVSQb3Q/hqdefault.jpg', action: 'Watch official trailer', url: 'https://www.youtube.com/watch?v=3anCgVSQb3Q' },
  { title: 'Erin Brockovich', kind: 'FILM · 2000', detail: 'A determined legal clerk builds a case for a community harmed by contaminated water, showing how one person’s attention can make a difference.', icon: 'film-outline', tint: '#2C3C34', preview: 'https://printedoriginals.com/cdn/shop/products/eri4.jpg?v=1682249416', action: 'Explore at Universal', url: 'https://www.universalpicturesathome.com/movies/erin-brockovich' },
];
const COMMUNITIES = [
  { name: 'New York Southeast Asia Network', tag: 'SOUTHEAST ASIA · NETWORK', detail: 'Connect with scholars and practitioners through regional events, publications, student groups, and resources.', icon: 'people-outline', color: '#2C3C34', url: 'https://www.nysean.org/' },
  { name: 'DC Asia Policy Network', tag: 'WASHINGTON, D.C. · COMMUNITY', detail: 'Meet people working in or interested in Asia policy through monthly gatherings, career events, and professional connections.', icon: 'chatbubbles-outline', color: '#34352F', url: 'https://www.dcasiapolicy.com/home' },
  { name: 'Asia Society', tag: 'GLOBAL · DIALOGUE & IDEAS', detail: 'Explore programs and perspectives across Asia policy, arts and culture, education, sustainability, business, and technology.', icon: 'globe-outline', color: '#30383A', url: 'https://asiasociety.org/' },
];
const MENTORS = [
  { name: 'Writing partner', role: 'A calm first reader', detail: 'Get a second perspective on the part that matters most.', icon: 'people-outline', tag: 'PEER SUPPORT' },
  { name: 'The Op-Ed Project', role: 'Amplify underrepresented voices', detail: 'Workshops and programs that help women and nonbinary experts publish.', icon: 'megaphone-outline', tag: 'TRAINING' },
  { name: 'Poynter', role: 'Journalism craft & ethics', detail: 'Reporting, editing and media literacy courses from working journalists.', icon: 'school-outline', tag: 'LEARNING' },
  { name: 'Asian American Journalists Association', role: 'Community & mentorship', detail: 'Programs and community for journalists and storytellers.', icon: 'globe-outline', tag: 'COMMUNITY' },
  { name: 'National Writers Union', role: 'Freelance writer resources', detail: 'Practical support on contracts, rates, and the business of writing.', icon: 'briefcase-outline', tag: 'RESOURCES' },
];
const COACH_RESOURCE_GROUPS = [
  {
    title: 'Myanmar voices', eyebrow: 'JOURNALISTS & COMMENTATORS', icon: 'mic-outline',
    cards: [
      { title: 'Kyaw Hsan Hlaing', label: 'JOURNALIST · RESEARCHER', detail: 'Reporting and analysis on Myanmar politics, conflict, and society.', url: 'https://www.kyawhsanhlaing.com/' },
      { title: 'Ye Myo Hein', label: 'POLICY · MYANMAR', detail: 'Explore his work and profile with the Wilson Center Asia Program.', url: 'https://www.wilsoncenter.org/person/ye-myo-hein' },
      { title: 'Nick Cheesman', label: 'MYANMAR POLITICS & LAW', detail: 'Research and writing on law, policing, and politics in Myanmar and the region.', url: 'https://nickcheesman.info/' },
      { title: 'Mratt Kyaw Thu', label: 'INDEPENDENT REPORTING', detail: 'Read reporting and dispatches from the Myanmar journalist.', url: 'https://mrattkthu.substack.com/' },
      { title: 'Burma2US', label: 'VIDEO & COMMENTARY', detail: 'Watch interviews and perspectives on Myanmar and its diaspora.', url: 'https://www.youtube.com/@burma2us' },
      { title: 'Reporters Without Borders', label: 'PRESS FREEDOM', detail: 'Read the organization’s statement on journalist Mratt Kyaw Thu.', url: 'https://rsf.org/en/rsf-asks-germany-let-myanmar-journalist-mratt-kyaw-thu-apply-asylum' },
    ],
  },
  {
    title: 'Independent journalism', eyebrow: 'NEWSLETTERS & FREELANCE VOICES', icon: 'newspaper-outline',
    cards: [
      { title: 'Heather Cox Richardson', label: 'LETTERS FROM AN AMERICAN', detail: 'History-informed commentary on American politics and public life.', url: 'https://heathercoxrichardson.substack.com/' },
      { title: 'Glenn Greenwald', label: 'SYSTEM UPDATE', detail: 'Independent reporting and commentary on politics, law, and media.', url: 'https://greenwald.substack.com/' },
      { title: 'Matt Taibbi', label: 'RACKET NEWS', detail: 'Independent reporting and commentary on politics and media.', url: 'https://www.racket.news/' },
      { title: 'Bari Weiss · The Free Press', label: 'INVESTIGATIONS & IDEAS', detail: 'Independent reporting, essays, and cultural commentary.', url: 'https://www.thefp.com/' },
      { title: 'Casey Newton · Platformer', label: 'TECH & PLATFORMS', detail: 'Coverage of technology, social platforms, and their influence.', url: 'https://www.platformer.news/' },
      { title: 'Taylor Lorenz · User Mag', label: 'INTERNET CULTURE', detail: 'Reporting on online communities, creators, and digital culture.', url: 'https://www.usermag.co/' },
      { title: 'Oliver Darcy · Status', label: 'MEDIA INDUSTRY', detail: 'A newsletter following the people and forces shaping media.', url: 'https://www.status.news/' },
      { title: 'Freelance voices', label: 'CULTURE · FOOD · TRAVEL', detail: 'Discover writers including Alice (Alesandra) Dubin and Perri Ormont Blumberg.', url: 'https://www.feedspot.com/blog/top-independent-journalists/' },
      { title: 'Independent journalists', label: 'WRITER DIRECTORY', detail: 'Browse journalist profiles and independent contributors.', url: 'https://journalist.net/journalists/from/the-independent' },
      { title: 'Myanmar journalists', label: 'BURMA DIRECTORY', detail: 'Browse journalist profiles connected with Myanmar.', url: 'https://journalist.net/journalists/in/burma' },
    ],
  },
  {
    title: 'Myanmar & regional experts', eyebrow: 'SCHOLARS · POLICY · RESEARCH', icon: 'school-outline',
    cards: [
      { title: 'Scot Marciel', label: 'U.S. · MYANMAR RELATIONS', detail: 'Former U.S. ambassador to Myanmar; explore expert perspectives and analysis.', url: 'https://news.umich.edu/u-m-experts-available-to-discuss-developments-in-us-myanmar-relations-jan2012/' },
      { title: 'Christina Fink', label: 'MYANMAR POLITICS & SOCIETY', detail: 'Research on Myanmar’s politics, civil society, and development.', url: 'https://elliott.gwu.edu/node/159' },
      { title: 'Penny Edwards', label: 'SOUTHEAST ASIA', detail: 'Scholarship on Burma/Myanmar, Cambodia, history, and cultural politics.', url: 'https://sseas.berkeley.edu/people/penny-edwards' },
      { title: 'Andrew J. Nathan', label: 'ASIAN POLITICS & HUMAN RIGHTS', detail: 'Columbia scholar of comparative politics, China, and human rights.', url: 'https://polisci.columbia.edu/content/andrew-j-nathan' },
      { title: 'David Thang Moe', label: 'RELIGION · IDENTITY · MYANMAR', detail: 'Research on religion, identity, ethnic conflict, and Myanmar.', url: 'https://macmillan.yale.edu/southeast-asia/person/david-thang-moe' },
      { title: 'Constant Courtin', label: 'INTERETHNIC DYNAMICS', detail: 'Explore research through the UBC Myanmar Initiative fellows directory.', url: 'https://ubcmyanmarinitiative.org/fellows/' },
      { title: 'Courtney Wittekind', label: 'MYANMAR · DEVELOPMENT', detail: 'Research on contemporary Myanmar, development, and urban life.', url: 'https://www.ctwittekind.com/' },
    ],
  },
  {
    title: 'Research directories', eyebrow: 'FIND MORE EXPERTS & FELLOWS', icon: 'library-outline',
    cards: [
      { title: 'UBC Myanmar Initiative', label: 'FELLOWS', detail: 'Researchers and fellows working on Myanmar.', url: 'https://ubcmyanmarinitiative.org/fellows/' },
      { title: 'University of Michigan', label: 'U.S. · MYANMAR EXPERTS', detail: 'Expert directory and background on U.S.–Myanmar relations.', url: 'https://news.umich.edu/u-m-experts-available-to-discuss-developments-in-us-myanmar-relations-jan2012/' },
      { title: 'Harvard Asia Center', label: 'PEOPLE & SCHOLARS', detail: 'Associates, fellows, and visiting scholars.', url: 'https://asiacenter.harvard.edu/people/associates-fellows-visiting-scholars' },
      { title: 'Council on Foreign Relations', label: 'ASIA PROGRAM', detail: 'Explore Asia-focused research and program contributors.', url: 'https://www.cfr.org/programs/asia-program?page=62' },
      { title: 'East-West Center', label: 'VISITING FELLOWS', detail: 'Meet current fellows based in Washington, D.C.', url: 'https://www.eastwestcenter.org/ewc-in-washington/visiting-fellows/current-fellows' },
      { title: 'Mansfield Foundation', label: 'ASIA SCHOLARS', detail: 'Explore Mansfield-Luce Asia scholars and their work.', url: 'https://mansfieldfdn.org/blog/mansfield-luce-asia-scholars/' },
      { title: 'Hawai‘i CSEAS', label: 'FACULTY & RESEARCH', detail: 'Find Southeast Asian studies faculty at the University of Hawai‘i.', url: 'https://www.cseashawaii.org/faculty/' },
    ],
  },
  {
    title: 'Visual storytelling', eyebrow: 'REPORTING IN VIDEO & NEWSLETTERS', icon: 'videocam-outline',
    cards: [
      { title: 'Johnny Harris', label: 'VIDEO JOURNALISM', detail: 'Visual explainers on global stories, history, and current events.', url: 'https://www.johnnyharris.ch/about' },
    ],
  },
];

function Pill({ children, tint = C.greenSoft, color = C.green }) { return <View style={[s.pill, { backgroundColor: tint }]}><Text style={[s.pillText, { color }]}>{children}</Text></View>; }
function SectionTitle({ eyebrow, title, action, onAction }) { return <View style={s.sectionHeader}><View><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text></View>{action ? <Pressable onPress={onAction}><Text style={s.link}>{action}</Text></Pressable> : null}</View>; }
function Header({ onProfile, subtitle = 'YOUR STORY, IN PRINT', initial = 'A' }) { return <View style={s.header}><View><Text style={s.brand}>publi<Text style={{ color: C.rust }}>.</Text></Text><Text style={s.headerSub}>{subtitle}</Text></View><Pressable onPress={onProfile} style={s.avatar}><Text style={s.avatarText}>{(initial || 'A').slice(0, 1).toUpperCase()}</Text><View style={s.onlineDot} /></Pressable></View>; }
function ExternalLink({ item, saved, onToggle, onOpen, compact = false }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const domain = (item.logoDomain || item.url).replace(/^https?:\/\//, '').split('/')[0];
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

  const logo = <View style={[s.publicationMark, compact && s.directoryLogo, { backgroundColor: item.color }]}>
    {!logoFailed && <Image source={{ uri: logoUrl }} style={s.publicationLogo} resizeMode="contain" onError={() => setLogoFailed(true)} accessibilityLabel={`${item.name} logo`} />}
    {logoFailed && <Text style={s.publicationMarkText}>{item.mark}</Text>}
  </View>;
  const bookmark = <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={saved ? `Remove ${item.name} from saved publications` : `Save ${item.name}`} hitSlop={9} style={compact ? s.directoryBookmark : s.bookmarkButton}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={compact ? 16 : 18} color={saved ? C.rust : C.muted} /></Pressable>;

  if (compact) return <View style={s.directoryCard}>
    <Pressable onPress={() => onOpen(item.url)} accessibilityRole="link" accessibilityLabel={`Open ${item.name}`} style={s.directoryCardMain}>
      {logo}
      <Text numberOfLines={2} style={s.directoryName}>{item.name}</Text>
      <Text numberOfLines={1} style={s.directoryArea}>{item.area}</Text>
    </Pressable>
  </View>;

  return <View style={s.linkCard}><Pressable onPress={() => onOpen(item.url)} style={s.linkCardMain}>
    {logo}
    <View style={{ flex: 1 }}><Text style={s.linkName}>{item.name}</Text><Text style={s.cardSub}>{item.area}</Text></View>
    <Ionicons name="open-outline" size={18} color={C.muted} />
  </Pressable>{bookmark}</View>;
}
function InspirationArtwork({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = item.cover || item.preview;
  if (image && !imageFailed) return <Image source={{ uri: image }} style={item.cover ? s.bookCover : s.mediaPreview} resizeMode="cover" onError={() => setImageFailed(true)} accessibilityLabel={`${item.title} artwork`} />;
  return <View style={s.inspirationIcon}><Ionicons name={item.icon} size={19} color={C.ink} /></View>;
}
function StoryIllustration() { return <View pointerEvents="none" style={s.storyIllo}><View style={s.illoHalo} /><View style={[s.illoPage, s.illoPageBack]} /><View style={[s.illoPage, s.illoPageMid]} /><View style={s.illoPage}><View style={s.illoPageTop}><View style={s.illoStamp}><Ionicons name="mic" size={15} color="#F5F3EC" /></View><View style={{ flex: 1 }}><View style={[s.illoLine, { width: 35 }]} /><View style={[s.illoLine, { width: 25, marginTop: 5, opacity: 0.5 }]} /></View></View><Text style={s.illoQuote}>“</Text><View style={[s.illoLine, { width: 69 }]} /><View style={[s.illoLine, { width: 53, marginTop: 6 }]} /></View><View style={s.illoOrb}><Ionicons name="sparkles" size={17} color="#D3B16C" /></View><View style={s.illoLeaf}><Ionicons name="leaf" size={19} color="#91B69F" /></View></View>; }

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [authMode, setAuthMode] = useState('welcome');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [infoPage, setInfoPage] = useState(null);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeScale = useRef(new Animated.Value(0.82)).current;
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    initializeFirebaseServices().then(() => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);
        if (user) {
          setProfileEmail(user.email || 'Guest account');
          if (user.displayName) setProfileName(user.displayName);
        }
        setAuthReady(true);
      });
    }).catch((error) => { if (!cancelled) { setAuthReady(true); Alert.alert('Firebase is unavailable', error?.message || 'Please check this build’s Firebase configuration.'); } });
    Animated.parallel([
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.spring(welcomeScale, { toValue: 1, friction: 8, tension: 22, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => setWelcomeDone(true), 2600);
    return () => { cancelled = true; unsubscribe(); clearTimeout(timer); };
  }, []);

  const [tab, setTab] = useState('Home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftText, setDraftText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [outline, setOutline] = useState([]);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [voiceStories, setVoiceStories] = useState([]);
  const [voiceStoriesLoaded, setVoiceStoriesLoaded] = useState(false);
  const [recordingsLoaded, setRecordingsLoaded] = useState(false);
  const [activeVoiceStoryId, setActiveVoiceStoryId] = useState(null);
  const [newVoiceStoryTitle, setNewVoiceStoryTitle] = useState('');
  const [voiceStoryBusy, setVoiceStoryBusy] = useState(false);
  const [topicIdeasOpen, setTopicIdeasOpen] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [speakingQuestion, setSpeakingQuestion] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [pendingVoiceUpload, setPendingVoiceUpload] = useState(null);
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [playingRecordingId, setPlayingRecordingId] = useState(null);
  const [loadingRecordingId, setLoadingRecordingId] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  const activeVoiceStory = voiceStories.find((story) => story.id === activeVoiceStoryId) || null;
  const visibleVoiceRecordings = recordings.filter((item) => activeVoiceStoryId === 'legacy' ? !item.storyId : item.storyId === activeVoiceStoryId);
  const [genreFilter, setGenreFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [profileName, setProfileName] = useState('Writer');
  const [profileEmail, setProfileEmail] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserInitialized, setBrowserInitialized] = useState(false);
  const [browserUrl, setBrowserUrl] = useState('about:blank');
  const [browserCurrentUrl, setBrowserCurrentUrl] = useState('');
  const [browserTitle, setBrowserTitle] = useState('');
  const [canWebGoBack, setCanWebGoBack] = useState(false);
  const browserRef = useRef(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 150);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const playbackFileRef = useRef(null);
  const cycleWidth = INSPIRATION.length * 198;
  const inspirationOffset = useRef(new Animated.Value(-cycleWidth)).current;
  const inspirationPosition = useRef(-cycleWidth);
  const inspirationAnimation = useRef(null);
  const inspirationContainer = useRef(null);
  const inspirationContainerLeft = useRef(0);
  const inspirationDirection = useRef(-1);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartPosition = useRef(-cycleWidth);
  const touchIsDragging = useRef(false);
  const normalizePosition = (position) => {
    let wrapped = (position + cycleWidth * 1.5) % cycleWidth;
    if (wrapped < 0) wrapped += cycleWidth;
    return wrapped - cycleWidth * 1.5;
  };
  const startInspirationAuto = () => {
    inspirationAnimation.current?.stop();
    const from = normalizePosition(inspirationPosition.current);
    inspirationPosition.current = from;
    inspirationOffset.setValue(from);
    const target = inspirationDirection.current < 0 ? -cycleWidth * 2 : 0;
    const remaining = Math.max(500, Math.abs(target - from) / 0.028);
    inspirationAnimation.current = Animated.timing(inspirationOffset, {
      toValue: target,
      duration: remaining,
      easing: (value) => value,
      useNativeDriver: true,
    });
    inspirationAnimation.current.start(({ finished }) => {
      if (!finished) return;
      inspirationPosition.current = -cycleWidth;
      inspirationOffset.setValue(-cycleWidth);
      startInspirationAuto();
    });
  };
  const touchPoint = (event) => event.nativeEvent.changedTouches?.[0] || event.nativeEvent.touches?.[0] || event.nativeEvent;
  const onInspirationTouchStart = (event) => {
    const point = touchPoint(event);
    touchStartX.current = point.pageX;
    touchStartY.current = point.pageY;
    touchIsDragging.current = false;
    inspirationAnimation.current?.stop();
    inspirationOffset.stopAnimation((position) => {
      touchStartPosition.current = position;
      inspirationPosition.current = position;
    });
  };
  const onInspirationTouchMove = (event) => {
    const point = touchPoint(event);
    const dx = point.pageX - touchStartX.current;
    const dy = point.pageY - touchStartY.current;
    if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.1) return;
    touchIsDragging.current = true;
    const position = normalizePosition(touchStartPosition.current + dx);
    inspirationPosition.current = position;
    inspirationOffset.setValue(position);
  };
  const onInspirationTouchEnd = (event) => {
    const point = touchPoint(event);
    const dx = point.pageX - touchStartX.current;
    const dy = point.pageY - touchStartY.current;
    if (touchIsDragging.current) {
      inspirationDirection.current = dx < 0 ? -1 : 1;
      startInspirationAuto();
      return;
    }
    if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      const localX = point.pageX - inspirationContainerLeft.current;
      let cardPosition = (localX - touchStartPosition.current) % cycleWidth;
      if (cardPosition < 0) cardPosition += cycleWidth;
      const cardIndex = Math.floor(cardPosition / 198) % INSPIRATION.length;
      openExternal(INSPIRATION[cardIndex].url);
    }
    inspirationPosition.current = touchStartPosition.current;
    startInspirationAuto();
  };

  useEffect(() => {
    startInspirationAuto();
    return () => {
      inspirationAnimation.current?.stop();
      inspirationOffset.stopAnimation();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setDrafts([]); setRecordings([]); setRecordingsLoaded(false); setVoiceStories([]); setVoiceStoriesLoaded(false); setActiveVoiceStoryId(null); setBookmarks([]); setProfileName('Writer');
      setDraftTitle(''); setDraftText(''); setEditingDraftId(null); setQuestions([]); setOutline([]);
      setActiveRecording(null); setSelectedQuestion(''); setPendingVoiceUpload(null); setPlayingRecordingId(null); player.pause();
      return;
    }
    const uid = firebaseUser.uid;
    const showSyncError = (error, source = 'account') => Alert.alert('Cloud sync unavailable', `${source}: ${error?.message || 'Please try again later.'}`);
    const unsubscribers = [
      subscribeDrafts(uid, setDrafts, (error) => showSyncError(error, 'drafts')),
      subscribeRecordings(uid, (items) => { setRecordings(items); setRecordingsLoaded(true); }, (error) => showSyncError(error, 'recordings')),
      subscribeVoiceStories(uid, (items) => { setVoiceStories(items); setVoiceStoriesLoaded(true); }, (error) => showSyncError(error, 'voice stories')),
      subscribeBookmarks(uid, setBookmarks, (error) => showSyncError(error, 'bookmarks')),
      subscribeProfile(uid, (profile) => { if (profile?.name) setProfileName(profile.name); }, (error) => showSyncError(error, 'profile')),
    ];
    AsyncStorage.multiGet(['publi.drafts', 'publi.profile.name', 'publi.profile.email', 'publi.bookmarks'])
      .then((pairs) => {
        if (pairs.some(([, value]) => value)) Alert.alert(
          'Import work from this device?',
          'Older Publi data on this device was not linked to an account. Import it into the account you are signed in with now?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Import', onPress: () => migrateLocalData(uid).catch(showSyncError) },
          ],
        );
      }).catch(showSyncError);
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, [firebaseUser?.uid]);
  useEffect(() => {
    if (activeVoiceStoryId !== null || !voiceStoriesLoaded || !recordingsLoaded) return;
    if (voiceStories.length) setActiveVoiceStoryId(voiceStories[0].id);
    else if (recordings.some((item) => !item.storyId)) setActiveVoiceStoryId('legacy');
    else setActiveVoiceStoryId('new');
  }, [activeVoiceStoryId, voiceStories, recordings, voiceStoriesLoaded, recordingsLoaded]);
  useEffect(() => {
    const title = draftTitle.trim();
    if (!firebaseUser?.uid || title.length < 3) { setOutline([]); setOutlineBusy(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setOutlineBusy(true);
      try { const points = await generateStoryOutline(title); if (!cancelled) setOutline(points); }
      catch (error) { if (!cancelled) { setOutline([]); Alert.alert('Could not build an outline', error?.message || 'Try again in a moment.'); } }
      finally { if (!cancelled) setOutlineBusy(false); }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draftTitle, firebaseUser?.uid]);
  const go = (target) => { setTab(target); setProfileOpen(false); setInfoPage(null); };
  const openExternal = (url) => { setBrowserUrl(url); setBrowserCurrentUrl(url); setBrowserTitle(''); setBrowserInitialized(true); setBrowserOpen(true); };
  const closeBrowser = () => setBrowserOpen(false);
  const navigateBack = () => {
    if (canWebGoBack) browserRef.current?.goBack();
    else closeBrowser();
    return true;
  };
  const toggleBookmark = async (name) => {
    if (!firebaseUser?.uid) return;
    const next = bookmarks.includes(name) ? bookmarks.filter((item) => item !== name) : [...bookmarks, name];
    try { await saveBookmarks(firebaseUser.uid, next); } catch (error) { Alert.alert('Could not save publication', error?.message || 'Please try again.'); }
  };
  const saveDraft = async () => {
    if (!draftText.trim()) { Alert.alert('A first line is enough', 'Add a few thoughts before saving your draft.'); return; }
    try {
      await saveCloudDraft(firebaseUser.uid, { id: editingDraftId || undefined, title: draftTitle.trim() || draftText.trim().slice(0, 42), body: draftText.trim() });
      setDraftTitle(''); setDraftText(''); setQuestions([]); setOutline([]); setEditingDraftId(null);
      Alert.alert('Saved to Drafts', 'Your story is here whenever you want to pick it back up.');
    } catch (error) { Alert.alert('Could not save draft', error?.message || 'Please try again.'); }
  };
  const askQuestions = async () => {
    const topicTitle = draftTitle.trim() || activeVoiceStory?.title?.trim() || newVoiceStoryTitle.trim();
    if (!topicTitle) { Alert.alert('Add a working title', 'A title gives Publi a topic for your outline.'); return; }
    setOutlineBusy(true);
    try { setOutline(await generateStoryOutline(topicTitle)); }
    catch (error) { Alert.alert('Could not build an outline', error?.message || 'Please try again.'); }
    finally { setOutlineBusy(false); }
  };
  const startVoiceRecording = async () => {
    if (recordingBusy || voiceStoryBusy || pendingVoiceUpload || !firebaseUser?.uid) return false;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone permission needed', 'Enable microphone access in Settings to record your thoughts.'); return false; }
      player.pause(); Speech.stop().catch(() => {}); setSpeakingQuestion(false);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingPaused(false);
      return true;
    } catch (error) {
      Alert.alert('Recording failed', error?.message || 'Please try again on a device with microphone access.');
      return false;
    }
  };
  const pauseVoiceRecording = () => {
    try { recorder.pause(); setRecordingPaused(true); }
    catch (error) { Alert.alert('Could not pause recording', error?.message || 'Please try again.'); }
  };
  const resumeVoiceRecording = () => {
    try { recorder.record(); setRecordingPaused(false); }
    catch (error) { Alert.alert('Could not resume recording', error?.message || 'Please try again.'); }
  };
  const cancelVoiceRecording = async () => {
    try { await recorder.stop(); await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); }
    catch (error) { Alert.alert('Could not cancel recording', error?.message || 'Please try again.'); }
    finally { setRecordingPaused(false); }
  };
  const uploadAndAnalyzeVoice = async (pending, onUploaded) => {
    let saved;
    let story = pending.story;
    setRecordingBusy(true);
    try {
      setProcessingStage('Preparing your voice story…');
      if (!story) {
        story = await createVoiceStory(firebaseUser.uid, { title: pending.title });
        setActiveVoiceStoryId(story.id);
        setNewVoiceStoryTitle('');
        setPendingVoiceUpload({ ...pending, story });
      }
      setProcessingStage('Uploading audio…');
      saved = await saveRecording(firebaseUser.uid, {
        uri: pending.uri, storyId: story.id, parentRecordingId: pending.parentRecordingId,
        attemptIndex: pending.attemptIndex, prompt: pending.question,
        durationMillis: pending.durationMillis,
        onProgress: (fraction) => setProcessingStage(`Uploading audio… ${Math.round(fraction * 100)}%`),
      });
      setPendingVoiceUpload(null);
      setActiveRecording(saved);
      onUploaded?.(saved);
      setProcessingStage('Transcribing and shaping your thought…');
      const result = await analyzeRecording({
        uri: pending.uri, mimeType: saved.contentType, title: story.title,
        priorContext: [story.openingText, pending.context].filter(Boolean).join('\n\n'),
        selectedQuestion: pending.question,
      });
      await updateRecording(firebaseUser.uid, saved.id, {
        recordingTitle: result.suggestedTitle || result.polishedText.split(/\s+/).slice(0, 7).join(' '),
        transcript: result.transcript, polishedText: result.polishedText,
        questions: result.followUpQuestions, status: 'ready', error: '',
      });
      saved = { ...saved, recordingTitle: result.suggestedTitle || result.polishedText.split(/\s+/).slice(0, 7).join(' '), transcript: result.transcript, polishedText: result.polishedText, questions: result.followUpQuestions, status: 'ready' };
      setActiveRecording(saved);
      setSelectedQuestion('');
      if (result.suggestedTitle) applySuggestedVoiceStoryTitle(firebaseUser.uid, story.id, result.suggestedTitle).catch(() => {});
    } catch (error) {
      if (saved) {
        await updateRecording(firebaseUser.uid, saved.id, { status: 'error', error: error?.message || 'AI could not process this recording.' }).catch(() => {});
        saved = { ...saved, status: 'error', error: error?.message || 'AI could not process this recording.' };
        Alert.alert('Audio saved, AI needs a retry', error?.message || 'Your voice note is safe in its story.');
      } else {
        setPendingVoiceUpload({ ...pending, story });
        Alert.alert('Recording still on this device', `${error?.message || 'Cloud upload failed.'} Tap Retry upload to save it.`);
      }
    } finally { setRecordingBusy(false); setProcessingStage(''); }
    return saved || null;
  };
  const finishVoiceRecording = async ({ fresh = false, sourceRecording = null, question = '', onUploaded } = {}) => {
    if (recordingBusy) return;
    const durationMillis = recorderState.durationMillis;
    try {
      await recorder.stop();
      setRecordingPaused(false);
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording file could not be found.');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      let story = fresh ? null : sourceRecording?.storyId
        ? voiceStories.find((item) => item.id === sourceRecording.storyId) || null
        : activeVoiceStory;
      if (sourceRecording?.storyId && !story) {
        throw new Error('This voice story is still syncing. Please try again in a moment.');
      }
      if (sourceRecording && !sourceRecording.storyId) {
        story = await adoptRecordingAsVoiceStory(firebaseUser.uid, sourceRecording.id);
      }
      const storyRecordings = story ? recordings.filter((item) => item.storyId === story.id) : [];
      const parent = fresh ? null : sourceRecording || (activeRecording?.storyId === story?.id ? activeRecording : storyRecordings[0] || null);
      const pending = {
        uri, durationMillis, story, title: fresh ? '' : newVoiceStoryTitle.trim(),
        parentRecordingId: parent?.id || null,
        attemptIndex: parent ? (parent.attemptIndex || 1) + 1 : 1,
        question: sourceRecording ? question : selectedQuestion,
        context: storyRecordings.map((item) => item.polishedText).filter(Boolean).reverse().join('\n\n'),
      };
      setPendingVoiceUpload(pending);
      return await uploadAndAnalyzeVoice(pending, onUploaded);
    } catch (error) { Alert.alert('Recording failed', error?.message || 'Please try again.'); return null; }
  };
  const retryVoiceUpload = async () => {
    if (pendingVoiceUpload && !recordingBusy) return uploadAndAnalyzeVoice(pendingVoiceUpload);
    return null;
  };
  const retryVoiceAnalysis = async (recording) => {
    if (recordingBusy || !firebaseUser?.uid) return;
    let localAudio;
    setRecordingBusy(true);
    setProcessingStage('Retrying transcription…');
    try {
      localAudio = await downloadRecordingForAnalysis(firebaseUser.uid, recording.storagePath);
      const story = voiceStories.find((item) => item.id === recording.storyId);
      const prior = recordings.filter((item) => item.storyId === recording.storyId && item.createdAtMs < recording.createdAtMs)
        .sort((a, b) => a.createdAtMs - b.createdAtMs).map((item) => item.polishedText).filter(Boolean).join('\n\n');
      const result = await analyzeRecording({
        uri: localAudio.uri, mimeType: localAudio.mimeType,
        title: story?.title || '', priorContext: [story?.openingText, prior].filter(Boolean).join('\n\n'),
        selectedQuestion: recording.prompt || '',
      });
      await updateRecording(firebaseUser.uid, recording.id, {
        recordingTitle: result.suggestedTitle || result.polishedText.split(/\s+/).slice(0, 7).join(' '),
        transcript: result.transcript, polishedText: result.polishedText,
        questions: result.followUpQuestions, status: 'ready', error: '',
      });
      setActiveRecording({ ...recording, recordingTitle: result.suggestedTitle || result.polishedText.split(/\s+/).slice(0, 7).join(' '), transcript: result.transcript, polishedText: result.polishedText, questions: result.followUpQuestions, status: 'ready' });
      if (story && result.suggestedTitle) applySuggestedVoiceStoryTitle(firebaseUser.uid, story.id, result.suggestedTitle).catch(() => {});
    } catch (error) { Alert.alert('Could not retry AI', error?.message || 'Your audio is still saved. Please try again.'); }
    finally {
      try { localAudio?.cleanup(); } catch { /* Temporary file cleanup is best effort. */ }
      setRecordingBusy(false); setProcessingStage('');
    }
  };
  const selectVoiceQuestion = async (question, recording) => {
    if (voiceStoryBusy) return false;
    if (recording.storyId) {
      setActiveVoiceStoryId(recording.storyId);
      setActiveRecording(recording); setSelectedQuestion(question);
      return true;
    }
    setVoiceStoryBusy(true);
    try {
      const story = await adoptRecordingAsVoiceStory(firebaseUser.uid, recording.id, { title: newVoiceStoryTitle.trim() });
      setActiveVoiceStoryId(story.id);
      setActiveRecording({ ...recording, storyId: story.id, attemptIndex: 1 });
      setSelectedQuestion(question);
      return true;
    } catch (error) { Alert.alert('Could not continue this voice note', error?.message || 'Please try again.'); return false; }
    finally { setVoiceStoryBusy(false); }
  };
  const chooseVoiceStory = (id) => {
    if (recordingBusy || voiceStoryBusy || pendingVoiceUpload) return;
    player.pause(); setPlayingRecordingId(null);
    setActiveVoiceStoryId(id); setActiveRecording(null); setSelectedQuestion('');
    if (id === 'new' || id === 'legacy') setNewVoiceStoryTitle('');
    if (!draftTitle.trim()) setOutline([]);
  };
  const chooseTopicIdea = (idea) => {
    chooseVoiceStory('new');
    setSelectedQuestion(idea);
    setTopicIdeasOpen(false);
  };
  const playRecording = async (recording) => {
    let nextFile;
    try {
      if (loadingRecordingId) return;
      if (playingRecordingId === recording.id) {
        if (playerStatus.playing) player.pause();
        else {
          if (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration - 0.2) await player.seekTo(0);
          player.play();
        }
        return;
      }
      setLoadingRecordingId(recording.id);
      await Speech.stop(); setSpeakingQuestion(false);
      nextFile = await downloadRecordingForAnalysis(firebaseUser.uid, recording.storagePath);
      player.pause();
      player.replace({ uri: nextFile.uri });
      playbackFileRef.current?.cleanup();
      playbackFileRef.current = nextFile;
      player.play();
      setPlayingRecordingId(recording.id);
    } catch (error) { nextFile?.cleanup(); Alert.alert('Could not play recording', error?.message || 'Please try again.'); }
    finally { setLoadingRecordingId(null); }
  };
  const stopRecordingPlayback = () => {
    player.pause();
    // Native expo-audio cannot cast null in replace(). Keep the downloaded
    // source until another recording replaces it, then remove the old cache.
    player.seekTo(0).catch(() => {});
    setPlayingRecordingId(null);
  };
  const editVoiceStoryTitle = async (story, recording, title) => {
    if (story) await updateVoiceStory(firebaseUser.uid, story.id, { title });
    else await updateRecording(firebaseUser.uid, recording.id, { recordingTitle: title });
  };
  const archiveVoiceStory = async (story, recording, archived) => {
    const target = story || await adoptRecordingAsVoiceStory(firebaseUser.uid, recording.id, { title: recording.title });
    await updateVoiceStory(firebaseUser.uid, target.id, { archived });
    if (playingRecordingId && (recording.id === playingRecordingId || recordings.some(item => item.storyId === target.id && item.id === playingRecordingId))) stopRecordingPlayback();
  };
  const removeVoiceStory = async (story, recording) => {
    if (playingRecordingId && (recording.id === playingRecordingId || recordings.some(item => item.storyId === story?.id && item.id === playingRecordingId))) stopRecordingPlayback();
    if (story) await deleteVoiceStory(firebaseUser.uid, story.id);
    else await deleteRecording(firebaseUser.uid, recording.id, recording.storagePath);
  };
  const speakVoiceQuestion = async (question) => {
    try {
      await Speech.stop();
      player.pause(); setSpeakingQuestion(true);
      Speech.speak(question, {
        language: 'en-US', rate: 0.94,
        onDone: () => setSpeakingQuestion(false),
        onStopped: () => setSpeakingQuestion(false),
        onError: () => setSpeakingQuestion(false),
      });
    } catch (error) { setSpeakingQuestion(false); Alert.alert('Could not read this question', error?.message || 'Please try again.'); }
  };
  const stopSpeakingQuestion = () => { Speech.stop().catch(() => {}); setSpeakingQuestion(false); };
  const removeRecording = (recording) => Alert.alert('Delete this voice note?', 'This removes its audio and transcript from your account.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try {
        if (playingRecordingId === recording.id) { player.pause(); setPlayingRecordingId(null); }
        await deleteRecording(firebaseUser.uid, recording.id, recording.storagePath);
        if (activeRecording?.id === recording.id) { setActiveRecording(null); setQuestions([]); }
      } catch (error) { Alert.alert('Could not delete recording', error?.message || 'Please try again.'); }
    } },
  ]);
  const removeDraft = (id) => Alert.alert('Delete this draft?', 'This cannot be undone.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteDraft(firebaseUser.uid, id); if (editingDraftId === id) { setEditingDraftId(null); setDraftTitle(''); setDraftText(''); } } catch (error) { Alert.alert('Could not delete draft', error?.message || 'Please try again.'); } } }]);
  const saveProfile = async () => {
    try {
      if (auth.currentUser && profileName.trim()) await updateProfile(auth.currentUser, { displayName: profileName.trim() });
      await saveCloudProfile(firebaseUser.uid, { name: profileName.trim(), email: firebaseUser.email || '' });
      setProfileEditing(false); Alert.alert('Profile saved', 'Your display name is synced.');
    } catch (error) { Alert.alert('Could not save profile', error?.message || 'Please try again.'); }
  };
  const clearLocalAccountData = async () => {
    await AsyncStorage.multiRemove(['publi.drafts', 'publi.profile.name', 'publi.profile.email', 'publi.bookmarks']).catch(() => {});
    setDrafts([]); setBookmarks([]); setProfileName('Writer'); setProfileEmail(''); setProfileEditing(false); setProfileOpen(false); setTab('Home');
  };
  const deleteAccount = () => Alert.alert('Delete your Publi account?', 'This permanently deletes your account, drafts, voice recordings, and saved publications from Firebase. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete account', style: 'destructive', onPress: async () => {
      try {
        if (!auth.currentUser) throw new Error('You are already signed out.');
        const signedInAt = Date.parse(auth.currentUser.metadata?.lastSignInTime || '');
        if (!auth.currentUser.isAnonymous && Number.isFinite(signedInAt) && Date.now() - signedInAt > 4 * 60 * 1000) {
          throw new Error('For your security, log out, sign in again, and retry account deletion. No cloud data has been removed.');
        }
        await deleteCloudAccountData(auth.currentUser.uid);
        await deleteUser(auth.currentUser);
        await clearLocalAccountData();
      } catch (error) {
        const message = error?.code === 'auth/requires-recent-login'
          ? 'For your security, sign in again and then retry account deletion.'
          : error?.message || 'Please try again.';
        Alert.alert('Account could not be deleted', message);
      }
    } },
  ]);
  const logOut = () => Alert.alert('Log out of Publi?', 'Your drafts and recordings will be ready when you sign in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: async () => { try { await signOut(auth); setProfileOpen(false); setProfileEditing(false); } catch (error) { Alert.alert('Could not log out', error?.message || 'Please try again.'); } } },
  ]);
  const submitAuth = async () => {
    setAuthError('');
    if (!authEmail.trim() || !authPassword) { setAuthError('Enter your email address and password.'); return; }
    if (authMode === 'signup' && authPassword.length < 6) { setAuthError('Choose a password with at least 6 characters.'); return; }
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        if (authName.trim()) await updateProfile(credential.user, { displayName: authName.trim() });
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
    } catch (error) {
      const messages = {
        'auth/invalid-email': 'That email address does not look valid.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/email-already-in-use': 'An account already uses this email. Try signing in.',
        'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
        'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
      };
      setAuthError(messages[error?.code] || error?.message || 'Could not sign in. Please try again.');
    } finally { setAuthBusy(false); }
  };
  const continueAsGuest = async () => {
    setAuthError(''); setAuthBusy(true);
    try { await signInAnonymously(auth); }
    catch (error) { setAuthError(error?.message || 'Guest sign-in is unavailable. Please try again.'); }
    finally { setAuthBusy(false); }
  };

  if (!welcomeDone || !authReady) return <SafeAreaProvider><SafeAreaView style={s.launchScreen}><StatusBar barStyle="light-content" backgroundColor={C.bg} /><Animated.View style={[s.launchMark, { opacity: welcomeOpacity, transform: [{ scale: welcomeScale }] }]}><Ionicons name="book" size={54} color={C.bg} /><View style={s.launchQuote}><Text style={s.launchQuoteText}>“</Text></View></Animated.View><Animated.Text style={[s.launchWordmark, { opacity: welcomeOpacity }]}>publi<Text style={{ color: C.rust }}>.</Text></Animated.Text><Text style={s.launchTag}>YOUR STORY, IN PRINT</Text></SafeAreaView></SafeAreaProvider>;

  if (!firebaseUser) return <SafeAreaProvider><SafeAreaView style={s.authScreen}><StatusBar barStyle="light-content" backgroundColor={C.bg} /><ScrollView contentContainerStyle={s.authScroll} keyboardShouldPersistTaps="handled">
    <View style={s.authBrand}><View style={s.authMark}><Ionicons name="book" size={29} color={C.bg} /><Text style={s.authMarkQuote}>“</Text></View><Text style={s.authWordmark}>publi<Text style={{ color: C.rust }}>.</Text></Text><Text style={s.authTag}>YOUR STORY, IN PRINT</Text></View>
    {infoPage ? <><Pressable onPress={() => setInfoPage(null)} style={s.infoBack}><Ionicons name="arrow-back" size={18} color={C.green} /><Text style={s.infoBackText}>Back</Text></Pressable><Text style={s.authTitle}>{infoPage}</Text>{LEGAL_COPY[infoPage].map(([heading, body]) => <View key={heading} style={s.legalSection}><Text style={s.legalHeading}>{heading}</Text><Text style={s.legalBody}>{body}</Text></View>)}</> : authMode === 'welcome' ? <>
      <Text style={s.authTitle}>A story starts{ '\n' }with a first line.</Text><Text style={s.authDesc}>A thoughtful place to shape what you’ve lived into something the world can read.</Text>
      <Pressable onPress={() => { setAuthError(''); setAuthMode('signup'); }} style={s.authPrimary}><Text style={s.authPrimaryText}>Create an account</Text><Ionicons name="arrow-forward" size={17} color={C.white} /></Pressable>
      <Pressable onPress={() => { setAuthError(''); setAuthMode('signin'); }} style={s.authSecondary}><Text style={s.authSecondaryText}>Sign in</Text></Pressable>
      <Pressable disabled={authBusy} onPress={continueAsGuest} style={s.guestButton}><Ionicons name="person-outline" size={17} color={C.green} /><Text style={s.guestText}>{authBusy ? 'Connecting…' : 'Continue as guest'}</Text></Pressable>
      {!!authError && <Text style={s.authError}>{authError}</Text>}
      </> : <>
      <Pressable onPress={() => { setAuthMode('welcome'); setAuthError(''); }} style={s.infoBack}><Ionicons name="arrow-back" size={18} color={C.green} /><Text style={s.infoBackText}>Welcome</Text></Pressable>
      <Text style={s.authTitle}>{authMode === 'signup' ? 'Create your account.' : 'Welcome back.'}</Text><Text style={s.authDesc}>{authMode === 'signup' ? 'Save your place and keep shaping your story.' : 'Pick up where your next story begins.'}</Text>
      {authMode === 'signup' && <TextInput value={authName} onChangeText={setAuthName} style={s.authInput} placeholder="Name (optional)" placeholderTextColor="#879188" autoCapitalize="words" />}
      <TextInput value={authEmail} onChangeText={setAuthEmail} style={s.authInput} placeholder="Email address" placeholderTextColor="#879188" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextInput value={authPassword} onChangeText={setAuthPassword} style={s.authInput} placeholder="Password" placeholderTextColor="#879188" secureTextEntry autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} />
      {!!authError && <Text style={s.authError}>{authError}</Text>}
      <Pressable disabled={authBusy} onPress={submitAuth} style={[s.authPrimary, authBusy && { opacity: .65 }]}><Text style={s.authPrimaryText}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</Text><Ionicons name="arrow-forward" size={17} color={C.white} /></Pressable>
      <Pressable onPress={() => { setAuthError(''); setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); }} style={s.authSecondary}><Text style={s.authSecondaryText}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New to Publi? Create an account'}</Text></Pressable>
      </>}
      {!infoPage && <View style={s.authLegal}><Text style={s.authLegalText}>By continuing, you agree to Publi’s</Text><Pressable onPress={() => setInfoPage('Terms of Service')}><Text style={s.authLegalLink}>Terms of Service</Text></Pressable><Text style={s.authLegalText}>and</Text><Pressable onPress={() => setInfoPage('Privacy Policy')}><Text style={s.authLegalLink}>Privacy Policy</Text></Pressable></View>}
      <Pressable onPress={() => setInfoPage('About Publi')} style={s.aboutLink}><Text style={s.aboutLinkText}>About Publi</Text></Pressable>
    </ScrollView></SafeAreaView></SafeAreaProvider>;

  const renderHome = () => <>
    <View style={s.welcome}><View style={s.welcomeTop}><Pill tint="#DDE9DF">A SPACE FOR YOUR VOICE</Pill><Text style={s.welcomeIssue}>No. 01&nbsp; · &nbsp;THE FIRST DRAFT</Text></View><StoryIllustration /><Text style={s.heroTitle}>Your story{ '\n' }belongs <Text style={s.heroItalic}>in the{ '\n' }conversation.</Text></Text><Text style={s.heroBody}>A thoughtful place to shape what you’ve lived into something the world can read.</Text><Pressable onPress={() => go('Draft')} style={s.primaryButton}><Text style={s.primaryButtonText}>Start with a story</Text><Ionicons name="arrow-forward" size={17} color={C.white} /></Pressable><View style={s.welcomeDecor}><View style={s.decorCircle} /><Text style={s.decorQuote}>“</Text></View></View>
    <View style={s.homeStats}><View><Text style={s.statNum}>{drafts.length.toString().padStart(2, '0')}</Text><Text style={s.statLabel}>STORIES STARTED</Text></View><View style={s.statRule} /><View><Text style={s.statNum}>01</Text><Text style={s.statLabel}>NEXT STEP: A FIRST LINE</Text></View></View>
    <SectionTitle eyebrow="A LITTLE CREATIVE COURAGE" title="Stories that stayed with us" />
    <Text style={s.inspirationIntro}>Films, books, television and true stories that remind us what a voice can do.</Text>
    <View ref={inspirationContainer} onLayout={() => inspirationContainer.current?.measureInWindow((x) => { inspirationContainerLeft.current = x; })} onTouchStart={onInspirationTouchStart} onTouchMove={onInspirationTouchMove} onTouchEnd={onInspirationTouchEnd} style={s.inspirationViewport}><Animated.View style={[s.inspirationTrack, { transform: [{ translateX: inspirationOffset }] }]}>{[...INSPIRATION, ...INSPIRATION, ...INSPIRATION].map((item, index) => <View key={`${item.title}-${index}`} accessible accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.action}`} onAccessibilityTap={() => openExternal(item.url)} style={[s.inspirationCard, { backgroundColor: item.tint }]}><InspirationArtwork item={item} /><Text style={s.inspirationType}>{item.kind}</Text><Text style={s.inspirationTitle}>{item.title}</Text><Text style={s.inspirationDetail}>{item.detail}</Text><View style={s.inspirationAction}><Text style={s.inspirationActionText}>{item.action}</Text><Ionicons name="arrow-forward" size={14} color={C.green} /></View></View>)}</Animated.View></View>
    <SectionTitle eyebrow="FIND YOUR PEOPLE" title="Community & networks" />
    <Text style={s.communityIntro}>Meet people, find events, and explore ideas across Asian communities and policy.</Text>
    {COMMUNITIES.map((item) => <Pressable key={item.name} onPress={() => openExternal(item.url)} accessibilityRole="link" accessibilityLabel={`Open ${item.name}`} style={({ pressed }) => [s.communityCard, { opacity: pressed ? 0.82 : 1 }]}><View style={s.communityTop}><View style={[s.communityIcon, { backgroundColor: item.color }]}><Ionicons name={item.icon} size={21} color={C.green} /></View><Text style={s.communityTag}>{item.tag}</Text></View><Text style={s.communityName}>{item.name}</Text><Text style={s.communityDetail}>{item.detail}</Text><View style={s.communityAction}><Text style={s.communityActionText}>Explore community</Text><Ionicons name="arrow-forward" size={15} color={C.green} /></View></Pressable>)}
    <SectionTitle eyebrow="FIND YOUR FORM" title="A story can take many shapes" action="Explore" onAction={() => go('Research')} />
    <View style={s.genreRow}>{GENRES.slice(0, 2).map(g => <Pressable key={g.name} onPress={() => { setGenreFilter(g.name); go('Research'); }} style={s.genreMini}><View style={[s.genreIcon, { backgroundColor: g.color }]}><Ionicons name={g.icon} size={21} color={C.green} /></View><Text style={s.genreTitle}>{g.name}</Text><Text style={s.genreDescription}>{g.desc}</Text></Pressable>)}</View>
    {drafts.length > 0 && <><SectionTitle eyebrow="ON YOUR DESK" title="Pick up where you left off" action="All drafts" onAction={() => go('Draft')} /><Pressable onPress={() => { setEditingDraftId(drafts[0].id); setDraftTitle(drafts[0].title); setDraftText(drafts[0].body); go('Draft'); }} style={s.savedTeaser}><View style={s.savedIcon}><Ionicons name="document-text-outline" size={20} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.linkName}>{drafts[0].title}</Text><Text style={s.cardSub}>{drafts[0].date} · {drafts[0].body.length} characters</Text></View><Ionicons name="arrow-forward" size={18} color={C.muted} /></Pressable></>}
    <View style={s.bottomQuote}><Text style={s.quoteMark}>“</Text><Text style={s.quoteText}>You don’t have to have it all figured out. You just have to begin.</Text><Text style={s.quoteBy}>THE PUBLI NOTEBOOK</Text></View>
  </>;

  const renderResearch = () => {
    const filteredGenres = GENRES.filter(g => (genreFilter === 'All' || g.name === genreFilter) && `${g.name} ${g.type} ${g.desc}`.toLowerCase().includes(search.toLowerCase()));
    const filteredLinks = LINKS.filter((item) => (!savedOnly || bookmarks.includes(item.name)) && `${item.name} ${item.area}`.toLowerCase().includes(search.toLowerCase()));
    return <>
      <View style={s.pageIntro}><Pill>THE READING ROOM</Pill><Text style={s.pageTitle}>Research &{ '\n' }find your form.</Text><Text style={s.pageDesc}>Explore the kinds of stories editors publish, then get to know the places that might be right for yours.</Text></View>
      <View style={s.searchBox}><Ionicons name="search-outline" size={18} color={C.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search genres & publications" placeholderTextColor="#929187" style={s.searchInput} /></View>
      <Pressable onPress={() => setSavedOnly(!savedOnly)} style={[s.savedFilter, savedOnly && s.savedFilterActive]}><Ionicons name={savedOnly ? 'bookmark' : 'bookmark-outline'} size={15} color={savedOnly ? C.white : C.green} /><Text style={[s.savedFilterText, savedOnly && { color: C.white }]}>Saved publications</Text><Text style={[s.savedCount, savedOnly && { color: '#DFE9E0' }]}>{bookmarks.length}</Text></Pressable>
      <SectionTitle eyebrow="START WITH THE SHAPE" title="Writing genres" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>{['All', ...GENRES.map(g => g.name)].map((g) => <Pressable onPress={() => setGenreFilter(g)} key={g} style={[s.filterPill, genreFilter === g && s.filterPillActive]}><Text style={[s.filterText, genreFilter === g && s.filterTextActive]}>{g}</Text></Pressable>)}</ScrollView>
      {filteredGenres.map((g) => <Pressable key={g.name} onPress={() => Alert.alert(g.name, `${g.type}\n\n${g.desc}\n\nTry it: write one sentence about the moment you want a reader to remember.`)} style={s.genreCard}><View style={[s.genreIcon, { backgroundColor: g.color }]}><Ionicons name={g.icon} size={22} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.genreType}>{g.type}</Text><Text style={s.linkName}>{g.name}</Text><Text style={s.cardSub}>{g.desc}</Text></View><Ionicons name="chevron-forward" size={18} color={C.muted} /></Pressable>)}
      <SectionTitle eyebrow="THE PUBLICATION DIRECTORY" title="Read where you might publish" />
      <Text style={s.sectionNote}>Official publication links, all in one reading list.</Text>
      <View style={s.directoryGrid}>{filteredLinks.map(item => <ExternalLink key={item.url} compact item={item} saved={bookmarks.includes(item.name)} onToggle={() => toggleBookmark(item.name)} onOpen={openExternal} />)}</View>
      {filteredLinks.length === 0 && <View style={s.emptyCard}><Ionicons name="bookmark-outline" size={23} color={C.muted} /><Text style={s.emptyTitle}>{savedOnly ? 'No saved publications yet.' : 'No matches yet.'}</Text><Text style={s.emptyBody}>{savedOnly ? 'Use the bookmark on any publication card to keep it here.' : 'Try another publication name or search term.'}</Text></View>}
    </>;
  };

  const renderDraft = () => <>
    <View style={s.pageIntro}><Pill tint="#34352F" color="#D3B16C">THE NOTEBOOK</Pill><Text style={s.pageTitle}>Catch the thought.{ '\n' }Follow it further.</Text><Text style={s.pageDesc}>Speak or write freely. When you’re ready, we’ll help you find the next good question.</Text></View>
    <View style={s.voiceStoryHeader}>
      <View style={{ flex: 1 }}><Text style={s.eyebrow}>VOICE STORIES</Text><Text style={s.voiceStoryHeading}>A place to think aloud.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="New voice story" onPress={() => chooseVoiceStory('new')} disabled={recordingBusy || voiceStoryBusy} style={s.newVoiceStoryButton}><Ionicons name="add" size={17} color={C.bg} /><Text style={s.newVoiceStoryButtonText}>New story</Text></Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.voiceStoryPicker} contentContainerStyle={s.voiceStoryPickerContent}>
      {voiceStories.map((story) => <Pressable key={story.id} accessibilityRole="button" accessibilityState={{ selected: activeVoiceStoryId === story.id }} onPress={() => chooseVoiceStory(story.id)} style={[s.voiceStoryChip, activeVoiceStoryId === story.id && s.voiceStoryChipSelected]}><Text numberOfLines={1} style={[s.voiceStoryChipText, activeVoiceStoryId === story.id && s.voiceStoryChipTextSelected]}>{story.title || 'Untitled voice story'}</Text></Pressable>)}
      {recordings.some((item) => !item.storyId) && <Pressable accessibilityRole="button" accessibilityState={{ selected: activeVoiceStoryId === 'legacy' }} onPress={() => chooseVoiceStory('legacy')} style={[s.voiceStoryChip, activeVoiceStoryId === 'legacy' && s.voiceStoryChipSelected]}><Text style={[s.voiceStoryChipText, activeVoiceStoryId === 'legacy' && s.voiceStoryChipTextSelected]}>Earlier notes</Text></Pressable>}
      {activeVoiceStoryId === 'new' && <View style={[s.voiceStoryChip, s.voiceStoryChipSelected]}><Text style={s.voiceStoryChipTextSelected}>New story</Text></View>}
    </ScrollView>
    {activeVoiceStory ? <View style={s.voiceStoryTitleCard}><Text style={s.eyebrow}>STORY TITLE</Text><TextInput key={`${activeVoiceStory.id}-${activeVoiceStory.title}`} defaultValue={activeVoiceStory.title} onEndEditing={(event) => updateVoiceStory(firebaseUser.uid, activeVoiceStory.id, { title: event.nativeEvent.text }).catch((error) => Alert.alert('Could not save title', error?.message || 'Please try again.'))} placeholder="Give this voice story a title…" placeholderTextColor={C.muted} style={s.voiceStoryTitleInput} /></View> : activeVoiceStoryId !== 'legacy' && <View style={s.voiceStoryTitleCard}><Text style={s.eyebrow}>OPTIONAL TITLE</Text><TextInput value={newVoiceStoryTitle} onChangeText={setNewVoiceStoryTitle} placeholder="Name this thought, or let Publi suggest a title…" placeholderTextColor={C.muted} style={s.voiceStoryTitleInput} /></View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Open topic ideas" onPress={() => setTopicIdeasOpen(true)} style={s.topicIdeasButton}><View style={s.topicIdeasIcon}><Ionicons name="sparkles-outline" size={19} color={C.gold} /></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>NEED A SPARK?</Text><Text style={s.topicIdeasTitle}>Topic ideas</Text><Text style={s.topicIdeasHint}>Explore your AI outline and ways to begin.</Text></View><Ionicons name="chevron-forward" size={19} color={C.green} /></Pressable>
    <DraftVoiceExperience
      recordings={visibleVoiceRecordings} activeRecording={activeRecording}
      selectedQuestion={selectedQuestion} title={activeVoiceStory?.title || newVoiceStoryTitle}
      onSelectQuestion={selectVoiceQuestion} onStart={startVoiceRecording}
      onFinish={finishVoiceRecording} onCancel={cancelVoiceRecording}
      onPause={pauseVoiceRecording} onResume={resumeVoiceRecording}
      onSpeakQuestion={speakVoiceQuestion} onStopSpeaking={stopSpeakingQuestion} speaking={speakingQuestion}
      isRecording={recorderState.isRecording} isPaused={recordingPaused}
      durationMillis={recorderState.durationMillis} recordingBusy={recordingBusy || voiceStoryBusy}
      processingStage={processingStage} pendingUpload={!!pendingVoiceUpload}
      onRetryUpload={retryVoiceUpload} onRetryAnalysis={retryVoiceAnalysis}
      playingRecordingId={playingRecordingId}
      isPlaying={playerStatus.playing} onPlay={playRecording} onDelete={removeRecording}
    />
    <View style={s.editorCard}><View style={s.editorHeader}><View style={s.editorBadge}><Ionicons name="create-outline" size={16} color={C.green} /></View><Text style={s.editorLabel}>OR WRITE IT DOWN</Text><Text style={s.wordCount}>{draftText.trim() ? draftText.trim().split(/\s+/).length : 0} words</Text></View>
      <TextInput value={draftTitle} onChangeText={setDraftTitle} placeholder="Give this story a working title…" placeholderTextColor="#969187" style={s.titleInput} />
      <TextInput value={draftText} onChangeText={(v) => { setDraftText(v); setQuestions([]); }} placeholder="Start with a moment, a question, or something you can’t stop thinking about…" placeholderTextColor="#969187" style={s.bodyInput} multiline textAlignVertical="top" />
      <View style={s.editorActions}><Pressable onPress={askQuestions} disabled={outlineBusy} style={s.secondaryButton}><Ionicons name="sparkles-outline" size={16} color={C.green} /><Text style={s.secondaryButtonText}>{outlineBusy ? 'Thinking…' : 'Build an outline'}</Text></Pressable><Pressable onPress={saveDraft} style={s.saveButton}><Text style={s.saveButtonText}>{editingDraftId ? 'Update draft' : 'Save draft'}</Text></Pressable></View>
    </View>
    {outline.length > 0 && <View style={s.questionsCard}><View style={s.questionHeader}><View><Text style={s.eyebrow}>TEN THREADS TO EXPLORE</Text><Text style={s.questionTitle}>A working outline.</Text></View><Ionicons name="sparkles" size={20} color={C.gold} /></View>{outline.map((point, i) => <View key={`${i}-${point}`} style={s.questionRow}><View style={s.questionNumber}><Text style={s.questionNumberText}>{i + 1}</Text></View><Text style={s.questionText}>{point}</Text></View>)}</View>}
    <Modal visible={topicIdeasOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setTopicIdeasOpen(false)}>
      <SafeAreaProvider><SafeAreaView edges={['top', 'bottom']} style={s.topicIdeasModal}>
        <View style={s.topicIdeasToolbar}><Pressable accessibilityRole="button" accessibilityLabel="Close topic ideas" onPress={() => setTopicIdeasOpen(false)} style={s.topicIdeasBack}><Ionicons name="arrow-back" size={21} color={C.ink} /></Pressable><Text style={s.topicIdeasToolbarTitle}>Topic ideas</Text><View style={s.topicIdeasBack} /></View>
        <ScrollView contentContainerStyle={s.topicIdeasScroll}><TopicIdeas outline={outline} onChooseTopic={chooseTopicIdea} onBuildOutline={askQuestions} loading={outlineBusy} title={draftTitle || activeVoiceStory?.title || newVoiceStoryTitle} /></ScrollView>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
    <SectionTitle eyebrow="SAFE ON YOUR DESK" title="Your saved drafts" action={drafts.length ? `${drafts.length} saved` : undefined} />
    {drafts.length === 0 ? <View style={s.emptyCard}><Ionicons name="documents-outline" size={25} color={C.muted} /><Text style={s.emptyTitle}>Nothing saved yet.</Text><Text style={s.emptyBody}>The first draft is always the hardest. Save it here when you’re ready.</Text></View> : drafts.map(d => <View key={d.id} style={s.draftItem}><Pressable onPress={() => { setEditingDraftId(d.id); setDraftTitle(d.title); setDraftText(d.body); setQuestions([]); }} style={{ flex: 1 }}><Text style={s.linkName}>{d.title}</Text><Text style={s.cardSub}>{d.date} · {d.body.length} characters</Text></Pressable><Pressable onPress={() => removeDraft(d.id)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={C.muted} /></Pressable></View>)}
  </>;

  const renderCoach = () => <>
    <View style={s.pageIntro}><Pill tint="#34352F" color="#B7B5A9">IN GOOD COMPANY</Pill><Text style={s.pageTitle}>Every writer{ '\n' }needs a reader.</Text><Text style={s.pageDesc}>Find a thoughtful next step, a community, or a real person to help your words find their shape.</Text></View>
    <View style={s.coachFeatured}><View style={s.coachFeaturedIcon}><Ionicons name="heart-outline" size={24} color={C.rust} /></View><Text style={s.coachFeaturedTag}>A NOTE BEFORE YOU BEGIN</Text><Text style={s.coachFeaturedTitle}>Your story is already worth telling.</Text><Text style={s.coachFeaturedBody}>These organizations offer real programs, learning, and community. Availability, costs, and eligibility vary—check each organization’s current details.</Text></View>
    <SectionTitle eyebrow="PEOPLE & PLACES TO GROW" title="Find your kind of support" />
    {MENTORS.map((m) => <View key={m.name} style={s.mentorCard}><View style={s.mentorTop}><View style={s.mentorIcon}><Ionicons name={m.icon} size={21} color={C.green} /></View><Pill tint="#34352F" color="#B7B5A9">{m.tag}</Pill></View><Text style={s.mentorName}>{m.name}</Text><Text style={s.mentorRole}>{m.role}</Text><Text style={s.mentorDetail}>{m.detail}</Text><Pressable onPress={() => { if (m.name === 'Writing partner') { Alert.alert('Try a feedback circle', 'Invite one trusted reader. Ask what stayed with them, where they wanted more detail, and what felt most like your voice.'); return; } const url = m.name === 'The Op-Ed Project' ? 'https://www.theopedproject.org/' : m.name === 'Poynter' ? 'https://www.poynter.org/' : m.name.startsWith('Asian American') ? 'https://www.aaja.org/' : 'https://nwu.org/'; openExternal(url); }} style={s.mentorLink}><Text style={s.mentorLinkText}>{m.name === 'Writing partner' ? 'Start with one reader' : 'Explore resources'}</Text><Ionicons name="arrow-up-outline" size={16} color={C.green} /></Pressable></View>)}
    <View style={s.coachResourceIntro}><SectionTitle eyebrow="PEOPLE TO READ & LEARN FROM" title="Perspectives worth exploring" /><Text style={s.coachResourceHint}>Independent journalists, Myanmar researchers, and storytellers—organized into quick, swipeable collections.</Text></View>
    {COACH_RESOURCE_GROUPS.map((group) => <View key={group.title} style={s.coachResourceGroup}>
      <View style={s.coachGroupHeading}><View style={s.coachGroupIcon}><Ionicons name={group.icon} size={16} color={C.green} /></View><View style={{ flex: 1 }}><Text style={s.coachGroupEyebrow}>{group.eyebrow}</Text><Text style={s.coachGroupTitle}>{group.title}</Text></View><Ionicons name="chevron-forward" size={15} color={C.muted} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.coachResourceRow} nestedScrollEnabled>
        {group.cards.map((card) => <Pressable key={card.title} accessibilityRole="button" accessibilityLabel={`Open ${card.title} inside Publi`} onPress={() => openExternal(card.url)} style={({ pressed }) => [s.coachResourceCard, pressed && s.coachResourceCardPressed]}>
          <View style={s.coachResourceCardTop}><Pill tint={card.label.includes('MYANMAR') ? '#2C3C34' : '#34352F'} color={card.label.includes('MYANMAR') ? C.green : '#C5B996'}>{card.label}</Pill><Ionicons name="open-outline" size={15} color={C.green} /></View>
          <Text numberOfLines={2} style={s.coachResourceName}>{card.title}</Text><Text numberOfLines={3} style={s.coachResourceDetail}>{card.detail}</Text>
          <View style={s.coachResourceAction}><Text style={s.coachResourceActionText}>Open in Publi</Text><Ionicons name="arrow-forward" size={13} color={C.green} /></View>
        </Pressable>)}
      </ScrollView>
    </View>)}
    <View style={s.coachDisclaimer}><Ionicons name="information-circle-outline" size={18} color={C.muted} /><Text style={s.disclaimerText}>Publi doesn’t currently provide live proofreading or one-to-one mentoring. We’ll help connect your writing practice to real-world support.</Text></View>
  </>;

  const renderPitch = () => <>
    <View style={s.pageIntro}><Pill tint="#34352F" color="#D3B16C">THE SUBMISSION DESK</Pill><Text style={s.pageTitle}>Make the{ '\n' }right introduction.</Text><Text style={s.pageDesc}>A good pitch is clear, specific, and made for the publication you’re writing to.</Text></View>
    <View style={s.pitchSteps}><Text style={s.eyebrow}>BEFORE YOU HIT SEND</Text>{[['01', 'Find the right desk', 'Read recent work in the section you’re pitching.'], ['02', 'Make the case', 'What is your idea, and why does it matter now?'], ['03', 'Show your reporting', 'Name the experience, expertise, or sources you bring.'], ['04', 'Check the rules', 'Read the current guidelines on the publication’s own site.']].map(([n, title, desc]) => <View key={n} style={s.stepRow}><Text style={s.stepNumber}>{n}</Text><View style={{ flex: 1 }}><Text style={s.stepTitle}>{title}</Text><Text style={s.stepDesc}>{desc}</Text></View></View>)}</View>
    <SectionTitle eyebrow="OFFICIAL SUBMISSION GUIDELINES" title="Pitch to a publication" />
    <Text style={s.sectionNote}>Tap a card for the outlet’s submission guidelines or official newsroom contact. Some outlets accept unsolicited pitches; others use these pages for general story tips or contact details.</Text>
    {PITCH_LINKS.map(item => <ExternalLink key={item.name} item={item} saved={bookmarks.includes(item.name)} onToggle={() => toggleBookmark(item.name)} onOpen={openExternal} />)}
    <View style={s.pitchTip}><View style={s.tipIcon}><Ionicons name="bulb-outline" size={20} color="#8B672D" /></View><View style={{ flex: 1 }}><Text style={s.tipTitle}>Your pitch can fit in one breath.</Text><Text style={s.tipBody}>“I’m writing about [specific idea] because [why now]. I bring [experience or reporting].” That’s a place to start—not a rigid formula.</Text></View></View>
    <Pressable onPress={() => go('Draft')} style={s.primaryButton}><Text style={s.primaryButtonText}>Shape your story first</Text><Ionicons name="arrow-forward" size={17} color={C.white} /></Pressable>
  </>;

  const renderProfile = () => <>
    <View style={s.profileHero}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { setProfileOpen(false); setProfileEditing(false); }} style={s.glassBackButton}><BlurView intensity={88} tint="dark" style={StyleSheet.absoluteFillObject} /><View pointerEvents="none" style={s.glassButtonShine} /><Ionicons name="arrow-back" size={19} color={C.ink} /></Pressable><View style={s.profileAvatarLarge}><Text style={s.profileInitial}>{(profileName[0] || 'A').toUpperCase()}</Text></View><Text style={s.profileTitle}>{profileName}</Text><Text style={s.profileSubtitle}>YOUR WRITER’S DESK</Text></View>
    {infoPage ? <><Pressable onPress={() => setInfoPage(null)} style={s.infoBack}><Ionicons name="arrow-back" size={18} color={C.green} /><Text style={s.infoBackText}>Back to profile</Text></Pressable><Text style={s.profileInfoTitle}>{infoPage}</Text>{LEGAL_COPY[infoPage].map(([heading, body]) => <View key={heading} style={s.legalSection}><Text style={s.legalHeading}>{heading}</Text><Text style={s.legalBody}>{body}</Text></View>)}</> : <>
    {profileEditing && <View style={s.profileCard}><Text style={s.eyebrow}>EDIT YOUR PROFILE</Text><Text style={s.formLabel}>Display name</Text><TextInput value={profileName} onChangeText={setProfileName} style={s.profileInput} placeholder="Your name" /><Text style={s.formLabel}>Signed in as</Text><Text style={s.profileEmailValue}>{firebaseUser?.email || 'Guest account'}</Text><Text style={s.profileNote}>Your profile, drafts, recordings, and saved publications sync to Firebase.</Text><Pressable onPress={saveProfile} style={s.primaryButton}><Text style={s.primaryButtonText}>Save profile</Text><Ionicons name="checkmark" size={18} color={C.white} /></Pressable></View>}
    <View style={s.settingsGroup}><Text style={s.eyebrow}>YOUR PUBLI</Text>
      <Pressable onPress={() => go('Draft')} style={s.settingsRow}><Ionicons name="documents-outline" size={19} color={C.green} /><Text style={s.settingsText}>My drafts</Text><Text style={s.settingsValue}>{drafts.length}</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={() => { setSavedOnly(true); go('Research'); }} style={s.settingsRow}><Ionicons name="bookmark-outline" size={19} color={C.green} /><Text style={s.settingsText}>Reading room</Text><Text style={s.settingsValue}>{bookmarks.length}</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={() => setProfileEditing((editing) => !editing)} style={s.settingsRow}><Ionicons name="person-outline" size={19} color={C.green} /><Text style={s.settingsText}>{profileEditing ? 'Close profile editor' : 'Edit profile'}</Text><Ionicons name={profileEditing ? 'chevron-up' : 'chevron-forward'} size={17} color={C.muted} /></Pressable>
      <Pressable onPress={() => setInfoPage('Terms of Service')} style={s.settingsRow}><Ionicons name="document-text-outline" size={19} color={C.green} /><Text style={s.settingsText}>Terms of service</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={() => setInfoPage('Privacy Policy')} style={s.settingsRow}><Ionicons name="shield-checkmark-outline" size={19} color={C.green} /><Text style={s.settingsText}>Privacy policy</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={logOut} style={s.settingsRow}><Ionicons name="log-out-outline" size={19} color={C.green} /><Text style={s.settingsText}>Log out</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={deleteAccount} style={[s.settingsRow, s.dangerSettingsRow]}><Ionicons name="trash-outline" size={19} color={C.rust} /><Text style={[s.settingsText, s.dangerSettingsText]}>Delete account</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
      <Pressable onPress={() => setInfoPage('About Publi')} style={s.settingsRow}><Ionicons name="information-circle-outline" size={19} color={C.green} /><Text style={s.settingsText}>About Publi</Text><Ionicons name="chevron-forward" size={17} color={C.muted} /></Pressable>
    </View>
    <View style={s.profileFooter}><Text style={s.profileFooterBrand}>publi.</Text><Text style={s.profileFooterVersion}>Version {APP_VERSION}</Text><Text style={s.version}>MADE FOR THE STORIES THAT MATTER</Text></View></>}
  </>;

  const content = profileOpen ? renderProfile() : tab === 'Home' ? renderHome() : tab === 'Research' ? renderResearch() : tab === 'Draft' ? null : tab === 'Coach' ? renderCoach() : renderPitch();
  return <SafeAreaView edges={['top']} style={s.safe}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <View style={s.appLayer} pointerEvents={browserOpen ? 'none' : 'auto'}>
      {tab === 'Draft' && !profileOpen ? <DraftHomePrototype
        onExit={() => go('Home')} uid={firebaseUser?.uid} recordings={recordings} voiceStories={voiceStories}
        onStartRecording={startVoiceRecording} onPauseRecording={pauseVoiceRecording}
        onResumeRecording={resumeVoiceRecording} onCancelRecording={cancelVoiceRecording}
        onFinishRecording={finishVoiceRecording} isRecording={recorderState.isRecording}
        isPaused={recordingPaused} durationMillis={recorderState.durationMillis} metering={recorderState.metering}
        recordingBusy={recordingBusy || voiceStoryBusy} processingStage={processingStage}
        pendingUpload={!!pendingVoiceUpload} onRetryUpload={retryVoiceUpload}
        onRetryAnalysis={retryVoiceAnalysis} onPlayRecording={playRecording}
        playingRecordingId={playingRecordingId} isPlaying={playerStatus.playing}
        loadingRecordingId={loadingRecordingId}
        playbackPosition={playerStatus.currentTime || 0} playbackDuration={playerStatus.duration || 0}
        onStopPlayback={stopRecordingPlayback} onEditStoryTitle={editVoiceStoryTitle}
        onArchiveStory={archiveVoiceStory} onDeleteStory={removeVoiceStory}
      /> : <>
      {!profileOpen && <Header onProfile={() => { setProfileEditing(false); setInfoPage(null); setProfileOpen(true); }} initial={profileName} subtitle={tab === 'Home' ? 'YOUR STORY, IN PRINT' : `${tab.toUpperCase()} · THE PUBLI DESK`} />}
      <ScrollView key={`${tab}-${profileOpen}`} style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView>
      </>}
      {!profileOpen && <View style={s.tabBarFrame}>
        <BlurView intensity={92} tint="dark" style={s.tabBar}>
          <View pointerEvents="none" style={s.tabGlassHighlight} />
          {TABS.map(item => { const active = item.id === tab; return <Pressable key={item.id} onPress={() => go(item.id)} style={s.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={[s.tabIconWrap, active && s.tabIconWrapActive]}><Ionicons name={item.active} size={23} color={active ? C.green : '#A7AEA7'} /></View>
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>{item.id}</Text>
          </Pressable>; })}
        </BlurView>
      </View>}
    </View>
    {browserInitialized && <Modal visible={browserOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={navigateBack}>
      <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={s.browserModal}>
      <StatusBar barStyle="light-content" backgroundColor="#222927" />
      <View style={s.browserToolbar}>
        <Pressable onPress={navigateBack} accessibilityRole="button" accessibilityLabel={canWebGoBack ? 'Go back to previous webpage' : 'Return to Publi'} style={s.glassBackButton}>
          <BlurView intensity={88} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={s.glassButtonShine} />
          <Ionicons name="chevron-back" size={22} color="#F3F3EB" />
        </Pressable>
        <View style={s.browserPageLabel}>
          <Text style={s.browserTitle} numberOfLines={1}>{browserTitle || 'Web page'}</Text>
          <Text style={s.browserAddress} numberOfLines={1}>{(browserCurrentUrl || browserUrl).replace(/^https?:\/\//, '').split('/')[0]}</Text>
        </View>
        <Pressable onPress={() => browserRef.current?.reload()} accessibilityRole="button" accessibilityLabel="Reload webpage" style={s.browserAction}>
          <Ionicons name="refresh" size={18} color={C.green} />
        </Pressable>
      </View>
      <WebView
        ref={browserRef}
        source={{ uri: browserUrl }}
        style={s.webView}
        originWhitelist={['about:srcdoc', 'https://*', 'http://*']}
        onNavigationStateChange={(state) => { setCanWebGoBack(state.canGoBack); setBrowserCurrentUrl(state.url); if (state.title && state.title !== 'about:blank') setBrowserTitle(state.title); }}
        onOpenWindow={({ nativeEvent }) => { if (nativeEvent.targetUrl) { setBrowserUrl(nativeEvent.targetUrl); setBrowserCurrentUrl(nativeEvent.targetUrl); } }}
        onError={() => Alert.alert('Page unavailable', 'This page could not be loaded. Check your connection and try again.')}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
      />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, appLayer: { flex: 1 }, browserModal: { flex: 1, backgroundColor: C.bg }, browserToolbar: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, backgroundColor: 'rgba(34,41,39,0.98)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }, browserPageLabel: { flex: 1, justifyContent: 'center' }, browserTitle: { color: '#F3F3EB', fontSize: 13, fontWeight: '700' }, browserAddress: { color: '#AEB5AD', fontSize: 10, marginTop: 3 }, browserAction: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, webView: { flex: 1, backgroundColor: C.bg }, scroll: { flex: 1 }, content: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 112 },
  launchScreen: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }, launchMark: { width: 106, height: 106, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, launchQuote: { position: 'absolute', top: 6, right: 17 }, launchQuoteText: { color: C.rust, fontFamily: 'Georgia', fontSize: 36, fontWeight: '700' }, launchWordmark: { fontFamily: 'Georgia', color: C.ink, fontWeight: '700', fontSize: 37, letterSpacing: -1.5, marginTop: 21 }, launchTag: { color: C.muted, fontSize: 8, fontWeight: '800', letterSpacing: 2, marginTop: 7 },
  authScreen: { flex: 1, backgroundColor: C.bg }, authScroll: { flexGrow: 1, paddingHorizontal: 27, paddingTop: 25, paddingBottom: 24 }, authBrand: { alignItems: 'center', marginBottom: 45 }, authMark: { height: 61, width: 61, borderRadius: 19, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }, authMarkQuote: { position: 'absolute', right: 8, top: 1, fontFamily: 'Georgia', fontSize: 23, color: C.rust, fontWeight: '700' }, authWordmark: { fontFamily: 'Georgia', color: C.ink, fontWeight: '700', fontSize: 27, marginTop: 8 }, authTag: { color: C.muted, fontSize: 7, fontWeight: '800', letterSpacing: 1.6, marginTop: 2 }, authTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 31, lineHeight: 37, letterSpacing: -.6, marginTop: 4 }, authDesc: { color: '#B9BDB5', fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 22 }, authPrimary: { height: 51, borderRadius: 5, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 10 }, authPrimaryText: { color: C.white, fontWeight: '800', fontSize: 13 }, authSecondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, authSecondaryText: { color: C.green, fontSize: 12, fontWeight: '700' }, guestButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderTopWidth: 1, borderColor: C.line, marginTop: 8 }, guestText: { color: C.green, fontSize: 12, fontWeight: '700' }, authInput: { height: 49, paddingHorizontal: 13, borderWidth: 1, borderColor: C.line, borderRadius: 7, backgroundColor: C.paper, color: C.ink, fontSize: 13, marginBottom: 10 }, authError: { color: '#E4A38C', fontSize: 11, lineHeight: 16, marginTop: 0, marginBottom: 4 }, authLegal: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', alignItems: 'center', marginTop: 24 }, authLegalText: { color: C.muted, fontSize: 9 }, authLegalLink: { color: C.green, fontSize: 9, textDecorationLine: 'underline' }, aboutLink: { alignSelf: 'center', paddingVertical: 15 }, aboutLinkText: { color: C.muted, fontSize: 10 }, infoBack: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 9, marginBottom: 8 }, infoBackText: { color: C.green, fontSize: 11, fontWeight: '700' }, legalSection: { marginTop: 17 }, legalHeading: { color: C.ink, fontFamily: 'Georgia', fontSize: 17, marginBottom: 6 }, legalBody: { color: '#B9BDB5', fontSize: 12, lineHeight: 19 }, profileInfoTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 28, marginTop: 2, marginBottom: 3 }, profileEmailValue: { color: C.ink, fontSize: 12, minHeight: 42, paddingVertical: 12, paddingHorizontal: 11, backgroundColor: '#1D2422', borderWidth: 1, borderColor: C.line, borderRadius: 9 },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { fontSize: 30, lineHeight: 32, color: C.ink, fontFamily: 'Georgia', fontWeight: '700', letterSpacing: -1.5 }, headerSub: { fontSize: 8, letterSpacing: 1.8, fontWeight: '700', color: C.muted, marginTop: 3 }, avatar: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#303733', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }, avatarText: { fontFamily: 'Georgia', fontSize: 17, color: C.green, fontWeight: '700' }, onlineDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: '#76A077', right: 0, bottom: 0, borderWidth: 1.5, borderColor: C.bg },
  welcome: { backgroundColor: '#292F2D', borderRadius: 16, padding: 20, minHeight: 320, marginTop: 12, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', shadowColor: '#77674D', shadowOpacity: .11, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, welcomeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, welcomeIssue: { color: '#ADB0A4', fontSize: 8, fontWeight: '700', letterSpacing: 1 }, pill: { alignSelf: 'flex-start', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 9 }, pillText: { fontSize: 8, letterSpacing: 1.1, fontWeight: '800' }, heroTitle: { position: 'relative', zIndex: 2, fontFamily: 'Georgia', fontSize: 36, lineHeight: 40, color: C.ink, fontWeight: '500', marginTop: 20, letterSpacing: -1.8, maxWidth: 260 }, heroItalic: { fontStyle: 'italic', color: C.green }, heroBody: { position: 'relative', zIndex: 2, fontSize: 13, lineHeight: 20, color: '#C0C4BC', marginTop: 10, maxWidth: 282 }, primaryButton: { position: 'relative', zIndex: 2, alignSelf: 'flex-start', backgroundColor: C.green, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11, paddingHorizontal: 15, marginTop: 16, shadowColor: C.green, shadowOpacity: .2, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, primaryButtonText: { color: C.white, fontSize: 12, fontWeight: '700', letterSpacing: 0.15 }, welcomeDecor: { position: 'absolute', width: 144, height: 144, borderRadius: 76, backgroundColor: 'rgba(194, 157, 103, 0.15)', bottom: -57, right: -23, alignItems: 'center', justifyContent: 'center' }, decorCircle: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: 'rgba(144, 111, 66, 0.3)' }, decorQuote: { position: 'absolute', fontFamily: 'Georgia', fontSize: 90, color: 'rgba(144, 111, 66, 0.27)', top: 2, left: 49 },
  homeStats: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: C.line, paddingBottom: 23, marginBottom: 29 }, statNum: { fontFamily: 'Georgia', color: C.ink, fontSize: 25 }, statLabel: { marginTop: 4, fontSize: 8, letterSpacing: 1, color: C.muted, fontWeight: '700' }, statRule: { width: 1, height: 36, backgroundColor: C.line, marginHorizontal: 24 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, marginTop: 4 }, eyebrow: { fontSize: 8, letterSpacing: 1.45, fontWeight: '800', color: C.muted }, sectionTitle: { fontFamily: 'Georgia', fontSize: 23, lineHeight: 28, color: C.ink, marginTop: 5, letterSpacing: -0.35 }, link: { color: C.green, fontSize: 11, fontWeight: '700', marginBottom: 4 }, inspirationIntro: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: -6, marginBottom: 12 }, communityIntro: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: -6, marginBottom: 12 }, communityCard: { backgroundColor: C.paper, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line, shadowColor: '#000000', shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, communityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, communityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }, communityTag: { color: C.muted, fontSize: 8, letterSpacing: 1, fontWeight: '800' }, communityName: { color: C.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 23, marginTop: 9 }, communityDetail: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 6 }, communityAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.line, paddingTop: 9, marginTop: 10 }, communityActionText: { color: C.green, fontSize: 10, fontWeight: '700' }, inspirationViewport: { overflow: 'hidden', marginBottom: 27 }, inspirationTrack: { flexDirection: 'row', alignItems: 'stretch' }, inspirationCard: { width: 188, minHeight: 260, marginRight: 10, borderRadius: 15, padding: 13, position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#645943', shadowOpacity: .1, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, inspirationIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', shadowColor: '#51432F', shadowOpacity: .13, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, mediaPreview: { width: '100%', height: 82, borderRadius: 8, marginBottom: 12, backgroundColor: 'rgba(255,255,255,.06)' }, bookCover: { width: 64, height: 88, borderRadius: 4, marginBottom: 12, backgroundColor: 'rgba(255,255,255,.06)', shadowColor: '#51432F', shadowOpacity: .18, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, inspirationType: { color: '#B7B5A9', fontSize: 8, fontWeight: '800', letterSpacing: 1 }, inspirationTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 18, marginTop: 5 }, inspirationDetail: { color: '#B9BDB5', fontSize: 11, lineHeight: 16, marginTop: 7, paddingRight: 8, flex: 1 }, inspirationAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: 'rgba(49,92,75,.18)', paddingTop: 10, marginTop: 13 }, inspirationActionText: { color: C.green, fontSize: 10, fontWeight: '700' }, genreRow: { flexDirection: 'row', gap: 11, marginBottom: 26 }, genreMini: { backgroundColor: C.paper, flex: 1, borderRadius: 14, padding: 12, minHeight: 138, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#645943', shadowOpacity: .08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, genreIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginBottom: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', shadowColor: '#51432F', shadowOpacity: .14, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, genreTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 16 }, genreDescription: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 5 }, savedTeaser: { backgroundColor: C.paper, padding: 13, borderRadius: 13, flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#645943', shadowOpacity: .08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, savedIcon: { width: 41, height: 41, borderRadius: 15, backgroundColor: C.greenSoft, justifyContent: 'center', alignItems: 'center', shadowColor: C.green, shadowOpacity: .14, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, bottomQuote: { borderTopWidth: 1, borderColor: C.line, paddingTop: 19, marginTop: 6 }, quoteMark: { color: C.rust, fontFamily: 'Georgia', fontSize: 45, height: 34 }, quoteText: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 19, lineHeight: 27, color: C.ink }, quoteBy: { marginTop: 10, fontSize: 8, letterSpacing: 1.5, color: C.muted, fontWeight: '800' },
  directoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 2, marginBottom: 18 }, directoryCard: { width: '31.5%', aspectRatio: 1, backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 9, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B100E', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, directoryCardMain: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 8 }, directoryLogo: { width: 38, height: 38, borderRadius: 13, marginBottom: 6, borderWidth: 0 }, directoryBookmark: { position: 'absolute', zIndex: 2, top: 7, right: 7, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' }, directoryName: { color: C.ink, fontFamily: 'Georgia', fontSize: 11, lineHeight: 13, textAlign: 'center', fontWeight: '600', width: '100%', minHeight: 26 }, directoryArea: { color: C.muted, fontSize: 8, textAlign: 'center', marginTop: 2, width: '100%' },
  pageIntro: { paddingTop: 20, paddingBottom: 23 }, pageTitle: { fontFamily: 'Georgia', fontSize: 37, lineHeight: 40, letterSpacing: -1.25, color: C.ink, marginTop: 15 }, pageDesc: { color: '#B9BDB5', fontSize: 13, lineHeight: 20, marginTop: 10 }, searchBox: { backgroundColor: C.paper, borderRadius: 13, paddingHorizontal: 13, height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: C.line, marginBottom: 12 }, searchInput: { flex: 1, height: '100%', paddingVertical: 0, fontSize: 13, lineHeight: 19, color: C.ink, textAlignVertical: 'center', includeFontPadding: false }, savedFilter: { alignSelf: 'flex-start', borderRadius: 18, backgroundColor: '#2C3C34', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 23 }, savedFilterActive: { backgroundColor: C.green }, savedFilterText: { fontSize: 10, color: C.green, fontWeight: '700' }, savedCount: { fontSize: 9, color: C.muted, fontWeight: '700' }, filterRow: { gap: 7, paddingBottom: 15 }, filterPill: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20, backgroundColor: '#303733' }, filterPillActive: { backgroundColor: C.green }, filterText: { color: '#C5C9C1', fontSize: 10, fontWeight: '600' }, filterTextActive: { color: C.white }, genreCard: { backgroundColor: C.paper, padding: 13, borderRadius: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#645943', shadowOpacity: .07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, genreType: { fontSize: 8, letterSpacing: 1.1, color: C.muted, fontWeight: '800', marginBottom: 3 }, sectionNote: { fontSize: 11, color: C.muted, marginTop: -5, marginBottom: 13, lineHeight: 16 }, linkCard: { backgroundColor: C.paper, padding: 9, borderRadius: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', shadowColor: '#645943', shadowOpacity: .07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, linkCardMain: { flex: 1, minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 3 }, bookmarkButton: { width: 37, height: 40, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: C.line }, publicationMark: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', shadowColor: '#1F2A25', shadowOpacity: .2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, publicationLogo: { width: 30, height: 30, borderRadius: 5 }, publicationMarkText: { color: C.white, fontFamily: 'Georgia', fontWeight: '700', fontSize: 12 }, linkName: { fontFamily: 'Georgia', fontSize: 16, color: C.ink }, cardSub: { fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 14 },
  recordCard: { backgroundColor: '#2B302D', padding: 16, borderRadius: 5, marginBottom: 13 }, recordTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, recordHeadline: { fontFamily: 'Georgia', fontSize: 20, color: C.ink, marginTop: 5 }, soundIcon: { width: 39, height: 39, borderRadius: 21, backgroundColor: '#343B37', alignItems: 'center', justifyContent: 'center' }, waveBox: { height: 47, marginVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }, waveBar: { width: 3, borderRadius: 2 }, recordHint: { fontSize: 10, color: C.muted }, recordButton: { backgroundColor: C.rust, alignSelf: 'center', borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 19, paddingVertical: 11, marginTop: 12 }, recordButtonActive: { backgroundColor: '#7F332A' }, recordButtonText: { color: C.white, fontSize: 11, fontWeight: '700' }, aiNote: { fontSize: 9, color: '#A7AEA7', textAlign: 'center', marginTop: 10 }, editorCard: { backgroundColor: C.paper, borderRadius: 5, padding: 15, borderWidth: 1, borderColor: C.line, marginBottom: 16 }, editorHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }, editorBadge: { width: 24, height: 24, borderRadius: 13, backgroundColor: C.greenSoft, justifyContent: 'center', alignItems: 'center' }, editorLabel: { color: C.muted, fontSize: 8, letterSpacing: 1.15, fontWeight: '800', flex: 1 }, wordCount: { color: C.muted, fontSize: 9 }, titleInput: { fontFamily: 'Georgia', fontSize: 18, color: C.ink, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 10 }, bodyInput: { minHeight: 122, fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: C.ink, paddingTop: 13 }, editorActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: C.line, paddingTop: 12 }, secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: '#52665B', borderRadius: 4 }, secondaryButtonText: { color: C.green, fontSize: 10, fontWeight: '700' }, saveButton: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.green, borderRadius: 4 }, saveButtonText: { fontSize: 10, color: C.white, fontWeight: '700' }, questionsCard: { backgroundColor: '#293832', borderRadius: 5, padding: 15, marginBottom: 22 }, questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, questionTitle: { fontFamily: 'Georgia', fontSize: 21, marginTop: 4, color: C.ink }, questionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, borderTopWidth: 1, borderColor: 'rgba(49,92,75,.12)' }, questionNumber: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#3A5144', alignItems: 'center', justifyContent: 'center' }, questionNumberText: { color: C.green, fontSize: 8, fontWeight: '800' }, questionText: { flex: 1, fontSize: 11, lineHeight: 16, color: '#C5C9C1' }, emptyCard: { backgroundColor: C.paper, borderRadius: 4, padding: 19, alignItems: 'center', marginBottom: 20 }, emptyTitle: { fontFamily: 'Georgia', fontSize: 18, color: C.ink, marginTop: 9 }, emptyBody: { textAlign: 'center', maxWidth: 235, color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, draftItem: { backgroundColor: C.paper, borderRadius: 4, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  historyCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 14, marginBottom: 10 },
  historyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyPlay: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  historyPrompt: { color: C.gold, fontSize: 11, lineHeight: 16, marginTop: 8 },
  historyLabel: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  historyBody: { color: C.ink, fontSize: 12, lineHeight: 19, marginTop: 5 },
  historyLink: { color: C.green, fontSize: 11, fontWeight: '700', marginTop: 12 },
  coachFeatured: { backgroundColor: '#2B302D', padding: 14, borderRadius: 4, marginBottom: 23 }, coachFeaturedIcon: { width: 36, height: 36, borderRadius: 19, backgroundColor: '#343B37', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, coachFeaturedTag: { fontSize: 8, color: C.rust, fontWeight: '800', letterSpacing: 1.3 }, coachFeaturedTitle: { fontFamily: 'Georgia', fontSize: 21, lineHeight: 26, color: C.ink, marginTop: 5 }, coachFeaturedBody: { color: '#B9BDB5', fontSize: 11, lineHeight: 17, marginTop: 8 }, mentorCard: { backgroundColor: C.paper, padding: 12, borderRadius: 4, marginBottom: 8, borderWidth: 1, borderColor: C.line }, mentorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, mentorIcon: { width: 35, height: 35, borderRadius: 18, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }, mentorName: { fontFamily: 'Georgia', fontSize: 18, color: C.ink, marginTop: 9 }, mentorRole: { fontSize: 11, color: C.green, fontWeight: '700', marginTop: 3 }, mentorDetail: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 6 }, mentorLink: { borderTopWidth: 1, borderColor: C.line, marginTop: 9, paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }, mentorLinkText: { fontSize: 10, color: C.green, fontWeight: '700' }, coachDisclaimer: { flexDirection: 'row', gap: 9, backgroundColor: '#2A302D', padding: 12, marginTop: 8, marginBottom: 12, borderRadius: 4 }, disclaimerText: { flex: 1, color: C.muted, fontSize: 10, lineHeight: 15 },
  coachResourceIntro: { marginTop: 17 }, coachResourceHint: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: -6, marginBottom: 20 }, coachResourceGroup: { marginBottom: 20 }, coachGroupHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }, coachGroupIcon: { width: 31, height: 31, borderRadius: 17, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }, coachGroupEyebrow: { color: C.muted, fontSize: 7, letterSpacing: 1.1, fontWeight: '800' }, coachGroupTitle: { fontFamily: 'Georgia', color: C.ink, fontSize: 17, marginTop: 2 }, coachResourceRow: { gap: 9, paddingRight: 22, paddingBottom: 3 }, coachResourceCard: { width: 200, minHeight: 138, padding: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 7, justifyContent: 'space-between' }, coachResourceCardPressed: { backgroundColor: '#2A342F', borderColor: C.green, transform: [{ scale: 0.985 }] }, coachResourceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, coachResourceName: { fontFamily: 'Georgia', color: C.ink, fontSize: 15, lineHeight: 19, marginTop: 8 }, coachResourceDetail: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 5, flex: 1 }, coachResourceAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.line, paddingTop: 7, marginTop: 8 }, coachResourceActionText: { color: C.green, fontSize: 9, fontWeight: '700' },
  pitchSteps: { backgroundColor: C.paper, borderRadius: 4, padding: 15, marginBottom: 27, borderWidth: 1, borderColor: C.line }, stepRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderColor: C.line, paddingVertical: 12, marginTop: 2 }, stepNumber: { fontFamily: 'Georgia', color: C.rust, fontSize: 13, marginTop: 1 }, stepTitle: { color: C.ink, fontSize: 12, fontWeight: '700' }, stepDesc: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, pitchTip: { flexDirection: 'row', gap: 10, backgroundColor: '#393528', padding: 13, marginTop: 12, marginBottom: 16, borderRadius: 4 }, tipIcon: { width: 31, height: 31, borderRadius: 17, backgroundColor: '#413A2B', alignItems: 'center', justifyContent: 'center' }, tipTitle: { color: '#5A4A2E', fontFamily: 'Georgia', fontSize: 16 }, tipBody: { color: '#776A53', fontSize: 10, lineHeight: 16, marginTop: 5 },
  profileHero: { alignItems: 'center', paddingTop: 24, paddingBottom: 23, position: 'relative' }, glassBackButton: { position: 'absolute', top: 0, left: 0, zIndex: 2, overflow: 'hidden', width: 43, height: 43, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', shadowColor: '#51665B', shadowOpacity: 0.18, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, glassButtonShine: { position: 'absolute', top: 1, left: 8, right: 8, height: 1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.16)' }, profileAvatarLarge: { width: 78, height: 78, borderRadius: 40, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center' }, profileInitial: { color: C.white, fontFamily: 'Georgia', fontSize: 35 }, profileTitle: { fontFamily: 'Georgia', color: C.ink, fontSize: 25, marginTop: 12 }, profileSubtitle: { color: C.muted, fontSize: 8, letterSpacing: 1.5, marginTop: 4, fontWeight: '700' }, profileCard: { backgroundColor: C.paper, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.line, shadowColor: '#645943', shadowOpacity: .07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, formLabel: { color: C.muted, fontSize: 10, fontWeight: '700', marginTop: 16, marginBottom: 6 }, profileInput: { borderWidth: 1, borderColor: C.line, backgroundColor: '#1D2422', height: 42, borderRadius: 9, paddingHorizontal: 11, color: C.ink, fontSize: 12 }, profileNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 12 }, settingsGroup: { marginTop: 26 }, settingsRow: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line }, settingsText: { flex: 1, fontSize: 12, color: C.ink, fontWeight: '600' }, settingsValue: { color: C.muted, fontSize: 10 }, dangerSettingsRow: { borderBottomColor: '#5A3932' }, dangerSettingsText: { color: C.rust }, profileFooter: { alignItems: 'center', marginTop: 28, marginBottom: 8 }, profileFooterBrand: { color: C.ink, fontFamily: 'Georgia', fontWeight: '700', fontSize: 25, letterSpacing: -1 }, profileFooterVersion: { color: C.muted, fontSize: 10, marginTop: 4 }, version: { textAlign: 'center', color: '#858D86', fontSize: 8, letterSpacing: 1.2, marginTop: 11, marginBottom: 14 },
  storyIllo: { position: 'absolute', right: 16, top: 86, width: 126, height: 130, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, illoHalo: { position: 'absolute', width: 112, height: 112, borderRadius: 60, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }, illoPage: { position: 'absolute', width: 77, height: 91, borderRadius: 5, backgroundColor: '#343B37', padding: 9, top: 18, right: 20, transform: [{ rotate: '7deg' }], shadowColor: '#4B3A20', shadowOpacity: 0.19, shadowRadius: 9, shadowOffset: { width: 0, height: 7 }, elevation: 6, borderWidth: 1, borderColor: '#45514A' }, illoPageMid: { top: 23, right: 27, backgroundColor: '#39433E', transform: [{ rotate: '-9deg' }], elevation: 4 }, illoPageBack: { top: 29, right: 32, backgroundColor: '#536B59', transform: [{ rotate: '-17deg' }], elevation: 3 }, illoPageTop: { flexDirection: 'row', gap: 6, alignItems: 'center' }, illoStamp: { height: 24, width: 24, borderRadius: 7, backgroundColor: C.rust, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }], shadowColor: C.rust, shadowOpacity: .3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }, illoLine: { height: 3, borderRadius: 2, backgroundColor: '#69766C' }, illoQuote: { fontFamily: 'Georgia', color: C.green, fontSize: 32, height: 32, marginTop: 4, marginLeft: -37 }, illoOrb: { width: 34, height: 34, borderRadius: 18, position: 'absolute', right: 0, top: 25, backgroundColor: '#4A4331', justifyContent: 'center', alignItems: 'center', shadowColor: '#745522', shadowOpacity: .24, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' }, illoLeaf: { width: 34, height: 34, borderRadius: 18, position: 'absolute', left: 0, bottom: 12, backgroundColor: '#34483B', justifyContent: 'center', alignItems: 'center', shadowColor: '#91B69F', shadowOpacity: .22, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  voiceStoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  voiceStoryHeading: { color: C.ink, fontFamily: 'Georgia', fontSize: 23, marginTop: 4 },
  newVoiceStoryButton: { backgroundColor: C.green, borderRadius: 19, paddingHorizontal: 11, height: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  newVoiceStoryButtonText: { color: C.bg, fontWeight: '800', fontSize: 11 },
  voiceStoryPicker: { marginBottom: 16, marginHorizontal: -22 },
  voiceStoryPickerContent: { gap: 8, paddingHorizontal: 22 },
  voiceStoryChip: { borderColor: C.line, borderWidth: 1, backgroundColor: C.paper, borderRadius: 18, paddingHorizontal: 13, height: 35, justifyContent: 'center', maxWidth: 190 },
  voiceStoryChipSelected: { backgroundColor: C.greenSoft, borderColor: C.green },
  voiceStoryChipText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  voiceStoryChipTextSelected: { color: C.ink, fontSize: 11, fontWeight: '800' },
  voiceStoryTitleCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 11, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 5, marginBottom: 14 },
  voiceStoryTitleInput: { color: C.ink, fontFamily: 'Georgia', fontSize: 16, minHeight: 37, paddingVertical: 5 },
  topicIdeasButton: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 15, marginTop: 7, marginBottom: 25 },
  topicIdeasIcon: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#393528', alignItems: 'center', justifyContent: 'center' },
  topicIdeasTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 18, marginTop: 3 },
  topicIdeasHint: { color: C.muted, fontSize: 10, marginTop: 3 },
  topicIdeasModal: { flex: 1, backgroundColor: C.bg },
  topicIdeasToolbar: { height: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, paddingHorizontal: 17 },
  topicIdeasBack: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center' },
  topicIdeasToolbarTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  topicIdeasScroll: { paddingHorizontal: 22, paddingTop: 23, paddingBottom: 35 },
  tabBarFrame: { position: 'absolute', bottom: 9, left: 13, right: 13, height: 72, borderRadius: 27, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(40,48,45,0.96)', shadowColor: '#283C36', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 }, tabBar: { height: '100%', backgroundColor: 'rgba(34,41,39,0.94)', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 5, paddingBottom: 2 }, tabGlassHighlight: { position: 'absolute', top: 0, left: 24, right: 24, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, tabIconWrap: { width: 43, height: 30, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, tabIconWrapActive: { backgroundColor: 'rgba(74,105,87,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', shadowColor: '#F5F3EC', shadowOpacity: 0.85, shadowRadius: 7, shadowOffset: { width: 0, height: 1 }, elevation: 2 }, tabLabel: { color: '#A7AEA7', fontSize: 11, fontWeight: '700' }, tabLabelActive: { color: '#A8CBB4', fontWeight: '800' },
});
