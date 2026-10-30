// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {assertGoalPage} from '@/test/goalPageContract';
import App,{GOAL_PAGE as appGoal} from './GoalAppStates';
import Offline,{GOAL_PAGE as offlineGoal} from './GoalOffline';
import Emails,{GOAL_PAGE as emailGoal} from './GoalEmails';
import NotFound,{GOAL_PAGE as notFoundGoal} from './GoalNotFound';
vi.mock('wouter',()=>({Link:({href,children,...props}:any)=><a href={href}{...props}>{children}</a>}));
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals()});
it.each([[App,appGoal],[Offline,offlineGoal],[Emails,emailGoal],[NotFound,notFoundGoal]] as const)('renders a fetch-free goal contract', (Page,goal)=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const {container}=render(<Page/>);assertGoalPage(container,goal);expect(fetch).not.toHaveBeenCalled()});
it('shows only a valid local draft on Offline',()=>{const url='https://careers.synthetic.example/jobs/123';localStorage.setItem('skipwait-pwa-referral-draft',JSON.stringify({name:'Synthetic candidate',targetUrl:url,updatedAt:1793310000000}));render(<Offline/>);expect(screen.getByText(url)).toBeTruthy()});
it('ignores malformed local draft',()=>{localStorage.setItem('skipwait-pwa-referral-draft','not-json');render(<Offline/>);expect(screen.getAllByRole('status')).toHaveLength(1)});
it('offers only the local 404 return links',()=>{render(<NotFound/>);expect(screen.getByRole('link',{name:'Go home'}).getAttribute('href')).toBe('/');expect(screen.getByRole('link',{name:'Explore companies'}).getAttribute('href')).toBe('/explore')});
it('covers every email selector plus distinct body/code/push/fallback branches without sending',()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<Emails/>);const names=['Work-email code','Password reset','Welcome','Request claimed','Ask accepted','Ask passed','New message','Waiting for coverage','Slot opened','Review ready','Re-verify reminder','Report outcome','Payment receipt / failed'];for(const name of names){fireEvent.click(screen.getByRole('button',{name,exact:true}));expect(screen.getByRole('article',{name,exact:true})).toBeTruthy()}fireEvent.click(screen.getByRole('button',{name:'Work-email code',exact:true}));expect(screen.getByRole('img',{name:'Six-digit code'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Report outcome',exact:true}));expect(screen.getByText('Update on your report')).toBeTruthy();expect(fetch).not.toHaveBeenCalled()});
it.each([['/requests?draft=1','assign'],['//outside.synthetic.example','reload'],['https://outside.synthetic.example','reload'],['','reload']])('Offline retry handles %s without an external destination',(from,method)=>{const location={search:'?from='+encodeURIComponent(from),assign:vi.fn(),reload:vi.fn()};const originalWindow=window;vi.stubGlobal('window',new Proxy(originalWindow,{get(target,key){return key==='location'?location:Reflect.get(target,key,target)}}));render(<Offline/>);fireEvent.click(screen.getByRole('button',{name:'Try again'}));if(method==='assign'){expect(location.assign).toHaveBeenCalledWith(from);expect(location.reload).not.toHaveBeenCalled()}else{expect(location.reload).toHaveBeenCalledTimes(1);expect(location.assign).not.toHaveBeenCalled()}});
