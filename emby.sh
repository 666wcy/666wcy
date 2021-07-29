#!/bin/bash
#=============================================================
# https://github.com/cgkings/script-store
# bash <(curl -sL git.io/cg_emby)
# File Name: cg_emby.sh
# Author: cgkings
# Created Time : 2021.3.4
# Description:swap一键脚本
# System Required: Debian/Ubuntu
# 感谢wuhuai2020、moerats、github众多作者，我只是整合代码
# Version: 1.0
#=============================================================

#set -e #异常则退出整个脚本，避免错误累加
#set -x #脚本调试，逐行执行并输出执行的脚本命令行

################## 退出通知 ##################
myexit() {
  if [ "$1" == 0 ];then
    TERM=ansi whiptail --title "正常退出" --infobox "欢迎使用cgkings（王大锤）系列脚本!
Goodbye！" --scrolltext 20 68
#whiptail --msgbox "The Email User list are $(cat /root/install_log.txt)." --scrolltext 20 40
    sleep 1s
    clear
    exit 0
  elif [ "$1" == 1 ];then
    TERM=ansi whiptail --title "异常退出" --infobox "异常退出，请查找原因!" 8 68
    exit 1
  fi
}

check_sys() {
  if [[ $(id -u) != 0 ]]; then
    whiptail --title "user not supported(用户权限不支持)" --msgbox "请使用root或者sudo用户运行,Please run this script as root or sudoer." 8 68
    echo -e "${red}Error:请使用root或者sudo用户运行,Please run this script as root or sudoer!${normal}"
    exit 1
  fi
  if [[ $(uname -m 2> /dev/null) != x86_64 ]]; then
    whiptail --title "hardware not supported(硬件不支持)" --msgbox "本脚本仅适用于x86_64机器,Please run this script on x86_64 machine." 8 68
    echo -e "${red}Error:本脚本仅适用于x86_64机器,Please run this script on x86_64 machine!${normal}"
    exit 1
  fi
  if [[ -d "/proc/vz" ]]; then
    whiptail --title "Virtualization technology not supported(虚拟化架构不支持)" --msgbox "本脚本暂时不支持openVZ架构,Please run this script on KVM." 8 68
    echo -e "${red}Error:本脚本暂时不支持openVZ架构!${normal}"
    exit 1
  fi
  if [[ $(free -m | grep Mem | awk '{print $2}' 2> /dev/null) -le "100" ]]; then
    whiptail --title "RAM not enough(内存不足)" --msgbox "本脚本需要至少100MB内存才能正常运作,Please run this script on machine with more than 100MB total ram." 8 68
    echo -e "${red}Error:本脚本需要至少100MB内存才能正常运作,Please run this script on machine with more than 100MB total ram!${normal}"
    exit 1
  fi
  #if [[ $(df $PWD | awk '/[0-9]%/{print $(NF-2)}' 2> /dev/null) -le "3000000" ]]; then
  #  whiptail --title "free disk space not enough(硬盘可用空间不足)" --msgbox "本脚本需要至少3GB硬盘可用空间才能正常运作,Please run this script on machine with more than 3G free disk space." 8 68
  #  echo -e "${red}Error:本脚本需要至少3GB硬盘可用空间才能正常运作,Please run this script on machine with more than 3G free disk space!${normal}"
  #  exit 1
  #fi
  #Disable cloud-init
  rm -rf /lib/systemd/system/cloud*
  ## 卸载腾讯云云盾
  if [[ -d /usr/local/qcloud ]]; then
    #disable tencent cloud process
    rm -rf /usr/local/sa
    rm -rf /usr/local/agenttools
    rm -rf /usr/local/qcloud
    #disable huawei cloud process
    rm -rf /usr/local/telescope
  fi
  ## 卸载阿里云云盾
  if [[ -d /usr/local/aegis ]]; then
    TERM=ansi whiptail --title "阿里云监控卸载" --infobox "检测到阿里云恶意监控服务，开始卸载..." 7 68
    echo -e "${curr_date} ${red}[INFO]${normal} Uninstall Aliyun aegis ing"
    iptables -I INPUT -s 140.205.201.0/28 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.201.16/29 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.201.32/28 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.192/29 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.200/30 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.184/29 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.183/32 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.206/32 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.205/32 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.195/32 -j DROP &> /dev/null
    iptables -I INPUT -s 140.205.225.204/32 -j DROP &> /dev/null
    systemctl stop aegis
    systemctl stop CmsGoAgent.service
    systemctl stop aliyun
    systemctl stop cloud-config
    systemctl stop cloud-final
    systemctl stop cloud-init-local.service
    systemctl stop cloud-init
    systemctl stop ecs_mq
    systemctl stop exim4
    systemctl stop apparmor
    systemctl stop sysstat
    systemctl disable aegis
    systemctl disable CmsGoAgent.service
    systemctl disable aliyun
    systemctl disable cloud-config
    systemctl disable cloud-final
    systemctl disable cloud-init-local.service
    systemctl disable cloud-init
    systemctl disable ecs_mq
    systemctl disable exim4
    systemctl disable apparmor
    systemctl disable sysstat
    killall -9 aegis_cli > /dev/null 2>&1
    killall -9 aegis_update > /dev/null 2>&1
    killall -9 aegis_cli > /dev/null 2>&1
    killall -9 AliYunDun > /dev/null 2>&1
    killall -9 AliHids > /dev/null 2>&1
    killall -9 AliHips > /dev/null 2>&1
    killall -9 AliYunDunUpdate > /dev/null 2>&1
    rm -rf /etc/init.d/aegis
    rm -rf /etc/systemd/system/CmsGoAgent*
    rm -rf /etc/systemd/system/aliyun*
    rm -rf /lib/systemd/system/cloud*
    rm -rf /lib/systemd/system/ecs_mq*
    rm -rf /usr/local/aegis
    rm -rf /usr/local/cloudmonitor
    rm -rf /usr/sbin/aliyun*
    rm -rf /sbin/ecs_mq_rps_rfs
    for ((var = 2; var <= 5; var++)); do
      if [ -d "/etc/rc${var}.d/" ]; then
        rm -rf "/etc/rc${var}.d/S80aegis"
      elif [ -d "/etc/rc.d/rc${var}.d" ]; then
        rm -rf "/etc/rc.d/rc${var}.d/S80aegis"
      fi
    done
    apt-get purge sysstat exim4 chrony aliyun-assist -y
    systemctl daemon-reload
    echo "nameserver 1.1.1.1" > '/etc/resolv.conf'
  fi
}

################## 检查安装情况 ##################
check_release() {
  if [[ -f /etc/redhat-release ]]; then
    release='centos'
  elif grep -q -E -i "debian" /etc/issue; then
    release='debian'
  elif grep -q -E -i "armbian" /etc/issue; then
    release='armdebian'
  elif grep -q -E -i "ubuntu" /etc/issue; then
    release='ubuntu'
  elif cat  | grep -q -E -i "redhat|red hat|centos" /etc/issue; then
    release='centos'
  else
    echo -e "${red}[ERROR]${normal} 您的系统太奇葩，本脚本不支持"
    exit
  fi
}

################## 前置变量 ##################
# shellcheck source=/dev/null
setcolor() {
  black=$(tput setaf 0)
  red=$(tput setaf 1)
  # shellcheck disable=SC2034
  green=$(tput setaf 2)
  # shellcheck disable=SC2034
  yellow=$(tput setaf 3)
  bold=$(tput bold)
  # shellcheck disable=SC2034
  jiacu=${normal}${bold}
  # shellcheck disable=SC2034
  blue=$(tput setaf 4)
  # shellcheck disable=SC2034
  magenta=$(tput setaf 5)
  # shellcheck disable=SC2034
  cyan=$(tput setaf 6)
  white=$(tput setaf 7)
  normal=$(tput sgr0)
  # shellcheck disable=SC2034
  on_black=$(tput setab 0)
  on_red=$(tput setab 1)
  on_green=$(tput setab 2)
  on_yellow=$(tput setab 3)
  on_blue=$(tput setab 4)
  on_magenta=$(tput setab 5)
  on_cyan=$(tput setab 6)
  on_white=$(tput setab 7)
  # shellcheck disable=SC2034
  shanshuo=$(tput blink)
  # shellcheck disable=SC2034
  wuguangbiao=$(tput civis)
  # shellcheck disable=SC2034
  guangbiao=$(tput cnorm)
  # shellcheck disable=SC2034
  underline=$(tput smul)
  # shellcheck disable=SC2034
  reset_underline=$(tput rmul)
  # shellcheck disable=SC2034
  dim=$(tput dim)
  standout=$(tput smso)
  # shellcheck disable=SC2034
  reset_standout=$(tput rmso)
  # shellcheck disable=SC2034
  title=${standout}
  # shellcheck disable=SC2034
  baihuangse=${white}${on_yellow}
  # shellcheck disable=SC2034
  bailanse=${white}${on_blue}
  # shellcheck disable=SC2034
  bailvse=${white}${on_green}
  # shellcheck disable=SC2034
  baiqingse=${white}${on_cyan}
  # shellcheck disable=SC2034
  baihongse=${white}${on_red}
  # shellcheck disable=SC2034
  baizise=${white}${on_magenta}
  # shellcheck disable=SC2034
  heibaise=${black}${on_white}
  # shellcheck disable=SC2034
  heihuangse=${on_yellow}${black}
}

#source <(curl -sL git.io/cg_script_option)
setcolor
ip_addr=$(hostname -I | awk '{print $1}')

################## 安装emby ##################
check_emby_version() {
  #获取官网最新正式版版本号(排除beta版)
  emby_version=$(curl -s https://github.com/MediaBrowser/Emby.Releases/releases/ | grep -Eo "tag/[0-9.]+\">([0-9.]+.*)" | grep -v "beta" | grep -Eo "[0-9.]+" | head -n1)
  emby_version=${emby_version:-"4.5.4.0"}
  #获取本地emby版本号
  if [[ "${release}" == "centos" ]]; then
    emby_local_version=$(rpm -q emby-server | grep -Eo "[0-9.]+\.[0-9]+")
  elif [[ "${release}" == "debian" ]] || [[ "${release}" == "ubuntu" ]] || [[ "${release}" == "armdebian" ]]; then
    emby_local_version=$(dpkg -l emby-server | grep -Eo "[0-9.]+\.[0-9]+")
  fi
}

check_emby() {
  check_emby_version
  #判断emby本地安装状态
  if [ -f /usr/lib/systemd/system/emby-server.service ]; then
      echo -e "${curr_date} ${green}[INFO]${normal} 您的系统已安装emby $emby_local_version,关于版本升级，请在网页操作。"
  else
    #如未安装，则进行安装
    echo -e "${curr_date} ${green}[INFO]${normal} 您的系统是 ${release}。正在为您准备安装包,请稍等..."
    if [[ "${release}" == "centos" ]]; then
      yum install https://github.com/MediaBrowser/Emby.Releases/releases/download/4.5.4.0/emby-server-rpm_4.5.4.0_x86_64.rpm -y
    elif [[ "${release}" == "debian" ]] || [[ "${release}" == "ubuntu" ]] || [[ "${release}" == "armdebian" ]]; then
      wget -vN https://github.com/MediaBrowser/Emby.Releases/releases/download/"${emby_version}"/emby-server-deb_"${emby_version}"_amd64.deb
      dpkg -i emby-server-deb_"${emby_version}"_amd64.deb
      sleep 1s
      rm -f emby-server-deb_"${emby_version}"_amd64.deb
    fi
    #安装常用插件
    echo -e "${curr_date} ${green}[INFO]${normal} 安装emby常用插件（Subscene射手字幕/JAV_scraper/Auto Organize/douban/Reports）."
    #wget -N -O kernel-
    #chown 998.998 /var/lib/emby/plugins/Emby.Subtitle.Subscene.dll  修改用户和用户组
    #chown 998.998 /var/lib/emby/plugins/JavScraper.dll
    #
    #修改emby服务,fail自动重启
    if grep -q "Restart=always" /usr/lib/systemd/system/emby-server.service; then
      echo
    else
      echo -e "${curr_date} ${green}[INFO]${normal} 修改emby服务设置fail自动重启."
      systemctl stop emby-server #结束 emby 进程
      sed -i '/[Service]/a\Restart=always\nRestartSec=2\nStartLimitInterval=0' /usr/lib/systemd/system/emby-server.service
      #破解emby
      rm -f /opt/emby-server/system/System.Net.Http.dll
      wget https://github.com/cgkings/script-store/raw/master/config/System.Net.Http.dll -O /opt/emby-server/system/System.Net.Http.dll #(注意替换掉命令中的 emby 所在目录)下载破解程序集替换原有程序
      sleep 3s
      systemctl daemon-reload && systemctl start emby-server
      whiptail --title "EMBY安装成功提示！！！" --msgbox "恭喜您EMBY安装成功，请您访问：http://${ip_addr}:8096 进一步配置Emby, 感谢使用~~~" 10 60
    fi
  fi
}

remote_choose() {
  #选择remote
  rclone listremotes | grep -Eo "[0-9A-Za-z-]+" | awk '{ print FNR " " $0}' > ~/.config/rclone/remote_list.txt
  remote_list=($(cat ~/.config/rclone/remote_list.txt))
  remote_choose_num=$(whiptail --clear --ok-button "上下键选择,回车键确定" --backtitle "Hi,欢迎使用cg_mount。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "remote选择" --menu --nocancel "注：上下键回车选择,ESC退出脚本！" 18 62 10 "${remote_list[@]}" 3>&1 1>&2 2>&3)
  if [ -z "$remote_choose_num" ]; then
    rm -f ~/.config/rclone/remote_list.txt
    myexit 0
  else
    my_remote=$(awk '{print $2}' /root/.config/rclone/remote_list.txt | sed -n "$remote_choose_num"p)
    rm -f ~/.config/rclone/remote_list.txt
  fi
}

################## 选择team drive ##################[done]
td_id_choose() {
  #生成td_id列表
  rclone lsjson "$my_remote":  | sed 's/,/\n/g' | grep "Name" | sed 's/:/\n/g' | sed '1~2d' | sed 's/"//g' |  awk '{ print FNR " " $0}' > ~/.config/rclone/td_list.txt
  #格式化td列表
  #sed -i 's/ //g;s/\;/    /g' ~/.config/rclone/td_list.txt
  td_list=($(cat ~/.config/rclone/td_list.txt))
  td_id_num=$(whiptail --clear --ok-button "上下键选择,回车键确定" --backtitle "Hi,欢迎使用cg_mount。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "文件夹选择" --menu --nocancel "注：上下键回车选择,ESC退出脚本！" 18 62 10 "${td_list[@]}" 3>&1 1>&2 2>&3)
  
	td_id=$(awk '{print $2}' /root/.config/rclone/td_list.txt | sed -n "$td_id_num"p)	
    
    

    if [ -z "$td_id" ]; then
      rm -f ~/.config/rclone/td_list.txt
      myexit 0
    else
      rm -f ~/.config/rclone/td_list.txt
    fi

}


################## 备份emby ##################
bak_emby() {
  check_emby
  remote_choose
  td_id_choose
  systemctl stop emby-server #结束 emby 进程
  rm -rf /var/lib/emby/cache/* #清空cache
  cd /var/lib && tar -cvf emby_bak_"$(date "+%Y-%m-%d")".tar emby #打包/var/lib/emby
  rclone move emby_bak_"$(date "+%Y-%m-%d")".tar "$my_remote":"${td_id}" -vP #上传gd
  systemctl start emby-server
}

################## 还原emby ##################
revert_emby() {
    check_emby
    remote_choose
    td_id_choose
    echo "$my_remote":"${td_id}"
    rclone lsf "$my_remote":"${td_id}" --include 'emby_bak*' --files-only -F "pt" | sed 's/ /_/g;s/\;/    /g' > ~/.config/rclone/bak_list.txt
    bak_list=($(cat ~/.config/rclone/bak_list.txt))
    bak_name=$(whiptail --clear --ok-button "选择完毕,进入下一步" --backtitle "Hi,欢迎使用。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "备份文件选择" --menu --nocancel "注：上下键回车选择,ESC退出脚本！" 18 62 10 \
    "${bak_list[@]}" 3>&1 1>&2 2>&3)
    if [ -z "$bak_name" ]; then
      rm -f ~/.config/rclone/bak_list.txt
      myexit 0
    else
      systemctl stop emby-server #结束 emby 进程
      
      rclone copy "$my_remote":${td_id}/"$bak_name" /root  -vP
      rm -rf /var/lib/emby
      tar -xvf "$bak_name" -C /var/lib && rm -f "$bak_name"
      systemctl start emby-server
      rm -rf ~/.config/rclone/bak_list.txt
    fi
}

################## 卸载emby ##################
del_emby() {
  systemctl stop emby-server #结束 emby 进程
  yum remove emby-server -y
}

################## 主菜单 ##################
main_menu() {
  Mainmenu=$(whiptail --clear --ok-button "选择完毕,进入下一步" --backtitle "Hi,欢迎使用cg_emby。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "cg_emby 主菜单" --menu --nocancel "注：本脚本的emby安装和卸载、备份和还原需要配套使用，ESC退出" 18 80 10 \
    "Install_standard" "基础安装(分项单选)" \
    "Install_Unattended" "无人值守(重装多选)" \
    "Exit" "退出" 3>&1 1>&2 2>&3)
  case $Mainmenu in
    Install_standard)
      standard_menu=$(whiptail --clear --ok-button "选择完毕,进入下一步" --backtitle "Hi,欢迎使用cg_emby。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "单选模式" --menu --nocancel "注：本脚本的emby安装和卸载、备份和还原需要配套使用，ESC退出" 22 65 10 \
        "Back" "返回上级菜单(Back to main menu)" \
        "install" "安装emby[已破解]" \
        "bak" "备份emby" \
        "revert" "还原emby" \
        "Uninstall" "卸载emby" 3>&1 1>&2 2>&3)
      case $standard_menu in
        Back)
          main_menu
          ;;
        install)
          check_emby
          ;;
        bak)
          bak_emby
          ;;
        revert)
          revert_emby
          ;;
        Uninstall)
          del_emby
          ;;
        *)
          myexit 0
          ;;
      esac
      ;;
    Install_Unattended)
      whiptail --clear --ok-button "回车开始执行" --backtitle "Hi,欢迎使用cg_toolbox。有关脚本问题，请访问: https://github.com/cgkings/script-store 或者 https://t.me/cgking_s (TG 王大锤)。" --title "无人值守模式" --checklist --separate-output --nocancel "请按空格及方向键来多选，ESC退出" 20 54 13 \
        "Back" "返回上级菜单(Back to main menu)" off \
        "mount" "挂载gd" off \
        "swap" "自动设置2倍物理内存的虚拟内存" off \
        "install" "安装emby" off \
        "revert" "还原emby" off 2> results
      while read choice; do
        case $choice in
          Back)
            main_menu
            break
            ;;
          mount)
            remote_choose
            td_id_choose
            dir_choose
            bash <(curl -sL git.io/cg_mount.sh) s $my_remote $td_id $mount_path
            ;;
          swap)
            bash <(curl -sL git.io/cg_swap) a
            ;;
          install)
            check_emby
            ;;
          revert)
            revert_emby
            ;;
          *)
            myexit 0
            ;;
        esac
      done < results
      rm results
      ;;
    Exit | *)
      myexit 0
      ;;
  esac
}

check_sys
check_release
#check_rclone
main_menu
#/usr/lib/systemd/system/rclone-mntgd.service
#/usr/lib/systemd/system/emby-server.service